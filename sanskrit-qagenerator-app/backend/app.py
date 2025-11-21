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
    if os.path.exists(CSV_PATH):
        os.remove(CSV_PATH)
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
    status: str
    current_row: int
    total_rows: int
    current_sanskrit: str
    error_message: str = ""
    results: List[Dict[str, Any]] = []

process_statuses: Dict[str, ProcessStatus] = {}

class BatchSaveRequest(BaseModel):
    process_id: str
    rows: List[Dict[str, Any]]

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

@app.post("/save-batch")
def save_batch(req: BatchSaveRequest):
    """Save selected rows from a batch process"""
    for row_data in req.rows:
        idx = row_data.get("id")
        if idx is not None:
            storage.update_row_with_qas(idx, row_data)
    return {"status": "ok"}

async def process_all_rows(process_id: str, qa_count: int):
    """Background task to process all rows and store results in memory"""
    status = process_statuses[process_id]
    try:
        total_rows = storage.row_count()
        status.total_rows = total_rows
        results = []
        
        for idx in range(total_rows):
            row = storage.get_row(idx)
            sanskrit_preview = row.get("sanskrit", "")[:50] + "..."
            
            status.current_row = idx + 1
            status.current_sanskrit = sanskrit_preview
            
            has_existing_data = storage.has_existing_qa_data(idx)
            
            if not has_existing_data:
                sanskrit = row.get("sanskrit", "")
                english = row.get("english", "")
                if sanskrit and english:
                    try:
                        generated_qas = generate_for_row(sanskrit, english, model=os.getenv("MODEL_NAME", MODEL_NAME), n=qa_count)
                        result_item = {"id": idx, "sanskrit": sanskrit, "english": english, **generated_qas}
                        results.append(result_item)
                    except Exception as e:
                        logger.error(f"Failed to generate Q&A for row {idx}: {e}")
                else:
                    logger.warning(f"Skipping row {idx} due to missing data.")
            else:
                logger.info(f"Skipping row {idx} as it already has Q&A data.")
            
            await asyncio.sleep(0.1)
        
        status.status = "completed"
        status.results = results
        logger.info(f"Batch processing completed for process {process_id}.")
        
    except Exception as e:
        logger.error(f"Batch processing failed for process {process_id}: {e}")
        status.status = "error"
        status.error_message = str(e)
