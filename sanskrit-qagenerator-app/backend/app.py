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
import uuid
from fastapi import BackgroundTasks

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env"))

from generate_api import generate_for_row
from storage import CSVManager

# Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("sanskrit-qagenerator")

CSV_FOLDER = os.getenv("CSV_FOLDER", "./data")
MODEL_NAME = os.getenv("MODEL_NAME", "gpt-oss:120b")

app = FastAPI(title="Sanskrit QnA Generator (local)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

csv_manager = CSVManager(data_folder=CSV_FOLDER)

class RowSummary(BaseModel):
    id: int
    sanskrit: str
    english: str

class GenerateRequest(BaseModel):
    qa_count: int = 4

@app.on_event("startup")
def startup():
    logger.info("Startup complete. Managing CSVs in: %s", CSV_FOLDER)

@app.get("/csvs")
def list_csvs():
    return csv_manager.list_csvs()

@app.post("/upload")
async def upload_csv(file: UploadFile = File(...)):
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV allowed")

    df = pd.read_csv(file.file, encoding='utf-8-sig').fillna("")
    csv_manager.add_csv(file.filename, df)
    return {"status": "ok", "filename": file.filename}

@app.get("/{filename}/rows", response_model=List[RowSummary])
def list_rows(filename: str, skip: int = 0, limit: int = 100, q: str = ""):
    storage = csv_manager.get_storage(filename)
    return storage.list_rows(skip=skip, limit=limit, q=q)

@app.get("/{filename}/row/{idx}")
def get_row(filename: str, idx: int):
    storage = csv_manager.get_storage(filename)
    r = storage.get_row(idx)
    if r is None:
        raise HTTPException(status_code=404, detail="Row not found")
    return r

@app.post("/{filename}/generate/{idx}")
def generate(filename: str, idx: int, req: GenerateRequest):
    storage = csv_manager.get_storage(filename)
    row = storage.get_row(idx)
    if not row:
        raise HTTPException(status_code=404, detail="Row not found")
    sanskrit = row.get("sanskrit", "")
    english = row.get("english", "")
    try:
        out = generate_for_row(sanskrit, english, model=MODEL_NAME, n=req.qa_count)
    except Exception as e:
        logger.exception("Generation failed")
        raise HTTPException(status_code=500, detail=str(e))
    return out

@app.post("/{filename}/save/{idx}")
def save_row(filename: str, idx: int, payload: Dict[str, Any]):
    storage = csv_manager.get_storage(filename)
    ok = storage.update_row_with_qas(idx, payload)
    if not ok:
        raise HTTPException(status_code=400, detail="Failed to save")
    return {"status": "ok"}

@app.post("/{filename}/ensure_headers/{count}")
def ensure_headers(filename: str, count: int):
    storage = csv_manager.get_storage(filename)
    storage.ensure_headers(count)
    return {"status": "ok"}

@app.get("/{filename}/download")
def download_csv(filename: str):
    storage = csv_manager.get_storage(filename)
    return FileResponse(storage.csv_path, media_type="text/csv; charset=utf-8-sig", filename=filename)

@app.get("/{filename}/data")
def get_all_data(filename: str):
    storage = csv_manager.get_storage(filename)
    return storage.list_all_rows()

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/batch_process/{filename}")
async def batch_process_single_file(filename: str, background_tasks: BackgroundTasks):
    output_filename = f"{os.path.splitext(filename)[0]}_processed.csv"
    background_tasks.add_task(run_single_file_batch, filename, output_filename)
    return {"status": "processing_started", "output_file": output_filename}

async def run_single_file_batch(filename: str, output_filename: str, qa_count: int = 4):
    logger.info(f"Starting background batch job for {filename}")
    try:
        storage = csv_manager.get_storage(filename)
        df_to_process = storage.df.copy()

        # Ensure all required columns exist
        storage.ensure_headers(qa_count)
        df_to_process = storage.df.copy() # re-copy after ensuring headers

        tasks = []
        for idx, row in df_to_process.iterrows():
            sanskrit = row.get("sanskrit", "")
            english = row.get("english", "")

            existing_qas = storage.count_existing_qas(idx)
            n_to_generate = qa_count - existing_qas

            if sanskrit and english and n_to_generate > 0:
                tasks.append(generate_and_update_row(idx, sanskrit, english, n_to_generate, existing_qas))

        if not tasks:
            logger.info(f"No rows to process for {filename}. Batch job finished.")
            csv_manager.add_csv(output_filename, df_to_process.fillna(""))
            return

        semaphore = asyncio.Semaphore(8)
        async def process_with_semaphore(task):
            async with semaphore:
                return await task
        
        results = await asyncio.gather(*(process_with_semaphore(task) for task in tasks))

        for res in results:
            if res:
                idx, qas, existing_qas = res
                for key, values in qas.items():
                    for i, value in enumerate(values, start=1):
                        col_name = f"{key}_{existing_qas + i}"
                        if col_name in df_to_process.columns:
                            df_to_process.at[idx, col_name] = value
        
        csv_manager.add_csv(output_filename, df_to_process.fillna(""))
        logger.info(f"Batch job for {filename} finished. Saved to {output_filename}")

    except Exception as e:
        logger.exception(f"Batch job for {filename} failed.")

async def generate_and_update_row(idx, sanskrit, english, n, existing_qas):
    loop = asyncio.get_running_loop()
    try:
        # Note: generate_for_row is a synchronous function
        qas = await loop.run_in_executor(None, generate_for_row, sanskrit, english, MODEL_NAME, n)
        return idx, qas, existing_qas
    except Exception as e:
        logger.error(f"Error generating for row {idx}: {e}")
        return None
