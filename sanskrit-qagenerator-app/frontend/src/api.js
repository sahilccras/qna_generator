// frontend/src/api.js
import axios from "axios";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

const api = axios.create({
    baseURL: API_BASE,
});

export async function listCsvs() {
  const res = await api.get("/csvs");
  return res.data;
}

export async function uploadCSV(file) {
  const fd = new FormData();
  fd.append("file", file);
  const res = await api.post("/upload", fd, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data;
}

export async function listRows(filename, skip = 0, limit = 1000, q = "") {
  const res = await api.get(`/${filename}/rows`, { params: { skip, limit, q } });
  return res.data;
}

export async function getRow(filename, id) {
  const res = await api.get(`/${filename}/row/${id}`);
  return res.data;
}

export async function generateRow(filename, id, qa_count = 4) {
  const res = await api.post(`/${filename}/generate/${id}`, { qa_count });
  return res.data;
}

export async function saveRow(filename, id, payload) {
  const res = await api.post(`/${filename}/save/${id}`, payload);
  return res.data;
}

export async function ensureHeaders(filename, count) {
    const res = await api.post(`/${filename}/ensure_headers/${count}`);
    return res.data;
}

export async function downloadCSV(filename) {
  const res = await api.get(`/${filename}/download`, { responseType: "blob" });
  return res.data;
}

export async function getAllData(filename) {
    const res = await api.get(`/${filename}/data`);
    return res.data;
}

// --- New Batch API ---

export async function startBatchJob(filename, rowIds, targetCount) {
    const res = await api.post("/api/batch/start", {
        filename,
        row_ids: rowIds,
        target_count: targetCount
    });
    return res.data;
}

export async function listBatchJobs() {
    const res = await api.get("/api/batch/jobs");
    return res.data;
}

export async function getBatchJob(jobId) {
    const res = await api.get(`/api/batch/${jobId}`);
    return res.data;
}

export async function cancelBatchJob(jobId) {
    const res = await api.post(`/api/batch/cancel/${jobId}`);
    return res.data;
}

export async function commitBatchJob(jobId) {
    const res = await api.post(`/api/batch/${jobId}/commit`);
    return res.data;
}
