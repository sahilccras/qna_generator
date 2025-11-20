# backend/app.py
import os
import shutil
import logging
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from pydantic import BaseModel
import pandas as pd
from typing import List, Dict, Any
import asyncio
from typing import List
import uuid
from fastapi import BackgroundTasks


load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env"))

from generate_api import generate_for_row
from storage import CSVStorage

# Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("sanskrit-qagenerator")

CSV_FOLDER = os.getenv("CSV_FOLDER", "./data")
CSV_FILENAME = os.getenv("CSV_FILENAME", "data.csv")
CSV_PATH = os.path.join(CSV_FOLDER, CSV_FILENAME)
MODEL_NAME = os.getenv("MODEL_NAME", "gpt-oss:120b")

app = FastAPI(title="Sanskrit QnA Generator (local)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],  
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

storage = CSVStorage(csv_path=CSV_PATH)

class RowSummary(BaseModel):
    id: int
    sanskrit: str
    english: str

class GenerateRequest(BaseModel):
    qa_count: int = 4

@app.on_event("startup")
def startup():
    os.makedirs(CSV_FOLDER, exist_ok=True)
    if not os.path.exists(CSV_PATH):
        headers = storage.headers_for_qa_count(4)
        df = pd.DataFrame(columns=headers)
        df.to_csv(CSV_PATH, index=False, encoding='utf-8-sig')
    storage.reload()
    logger.info("Startup complete. CSV path: %s", CSV_PATH)

@app.post("/upload")
async def upload_csv(file: UploadFile = File(...)):
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV allowed")
    temp_path = CSV_PATH + ".uploading"
    with open(temp_path, "wb") as f:
        shutil.copyfileobj(file.file, f)
    shutil.move(temp_path, CSV_PATH)
    storage.reload()
    return {"status": "ok", "rows": storage.row_count()}

@app.get("/rows", response_model=List[RowSummary])
def list_rows(skip: int = 0, limit: int = 100, q: str = ""):
    return storage.list_rows(skip=skip, limit=limit, q=q)

@app.get("/row/{idx}")
def get_row(idx: int):
    r = storage.get_row(idx)
    if r is None:
        raise HTTPException(status_code=404, detail="Row not found")
    return r

@app.post("/generate/{idx}")
def generate(idx: int, req: GenerateRequest):
    row = storage.get_row(idx)
    if not row:
        raise HTTPException(status_code=404, detail="Row not found")
    sanskrit = row.get("sanskrit", "")
    english = row.get("english", "")
    try:
        out = generate_for_row(sanskrit, english, model=os.getenv("MODEL_NAME", MODEL_NAME), n=req.qa_count)
    except Exception as e:
        logger.exception("Generation failed")
        raise HTTPException(status_code=500, detail=str(e))
    return out

@app.post("/save/{idx}")
def save_row(idx: int, payload: Dict[str, Any]):
    ok = storage.update_row_with_qas(idx, payload)
    if not ok:
        raise HTTPException(status_code=400, detail="Failed to save")
    return {"status": "ok"}

@app.post("/ensure_headers/{count}")
def ensure_headers(count: int):
    storage.ensure_headers(count)
    return {"status": "ok"}

@app.get("/download")
def download_csv():
    return FileResponse(CSV_PATH, media_type="text/csv; charset=utf-8-sig", filename=os.path.basename(CSV_PATH))

@app.get("/data")
def get_all_data():
    return storage.list_all_rows()

@app.get("/health")
def health():
    return {"status": "ok"}

class BatchProcessRequest(BaseModel):
    qa_count: int = 4

class ProcessStatus(BaseModel):
    process_id: str
    status: str  # "running", "completed", "error"
    current_row: int
    total_rows: int
    current_sanskrit: str
    error_message: str = ""

# Store process status in memory (for production, use Redis or database)
process_statuses: Dict[str, ProcessStatus] = {}

@app.post("/process-batch")
async def process_batch(req: BatchProcessRequest, background_tasks: BackgroundTasks):
    """Start batch processing of all rows"""
    process_id = str(uuid.uuid4())
    
    # Initialize status
    process_statuses[process_id] = ProcessStatus(
        process_id=process_id,
        status="running",
        current_row=0,
        total_rows=storage.row_count(),
        current_sanskrit=""
    )
    
    # Start background task
    background_tasks.add_task(process_all_rows, process_id, req.qa_count)
    
    return {"process_id": process_id, "status": "started"}

@app.get("/process-status/{process_id}")
def get_process_status(process_id: str):
    """Get current status of batch processing"""
    status = process_statuses.get(process_id)
    if not status:
        raise HTTPException(status_code=404, detail="Process not found")
    return status

async def process_all_rows(process_id: str, qa_count: int):
    """Background task to process all rows"""
    try:
        total_rows = storage.row_count()
        logger.info(f"Starting batch processing for {total_rows} rows")
        
        for idx in range(total_rows):
            # Update status
            row = storage.get_row(idx)
            sanskrit_preview = row.get("sanskrit", "")[:50] + "..." if len(row.get("sanskrit", "")) > 50 else row.get("sanskrit", "")
            
            process_statuses[process_id] = ProcessStatus(
                process_id=process_id,
                status="running",
                current_row=idx + 1,
                total_rows=total_rows,
                current_sanskrit=sanskrit_preview
            )
            
            logger.info(f"Processing row {idx + 1}/{total_rows}: {sanskrit_preview}")
            
            # Check if this row already has Q&A data
            has_existing_data = any(key.startswith('q_en_') and row.get(key) for key in row.keys() if key.startswith('q_en_'))
            
            if not has_existing_data:
                # Generate Q&A for this row
                sanskrit = row.get("sanskrit", "")
                english = row.get("english", "")
                
                if sanskrit and english:
                    try:
                        out = generate_for_row(sanskrit, english, model=os.getenv("MODEL_NAME", MODEL_NAME), n=qa_count)
                        storage.update_row_with_qas(idx, out)
                        logger.info(f"Successfully generated and saved Q&A for row {idx}")
                    except Exception as e:
                        logger.error(f"Failed to generate Q&A for row {idx}: {str(e)}")
                        # Continue with next row instead of failing entire batch
                        continue
                else:
                    logger.warning(f"Skipping row {idx} - missing Sanskrit or English text")
            else:
                logger.info(f"Skipping row {idx} - already has Q&A data")
            
            # Small delay to prevent overwhelming the system
            await asyncio.sleep(0.1)
        
        # Mark as completed
        process_statuses[process_id] = ProcessStatus(
            process_id=process_id,
            status="completed",
            current_row=total_rows,
            total_rows=total_rows,
            current_sanskrit="All rows processed"
        )
        logger.info(f"Batch processing completed for {total_rows} rows")
        
    except Exception as e:
        logger.error(f"Batch processing failed: {str(e)}")
        process_statuses[process_id] = ProcessStatus(
            process_id=process_id,
            status="error",
            current_row=0,
            total_rows=total_rows,
            current_sanskrit="",
            error_message=str(e)
        )
