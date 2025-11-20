// frontend/src/api.js
import axios from "axios";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

export async function uploadCSV(file) {
  const fd = new FormData();
  fd.append("file", file);
  const r = await axios.post(`${API_BASE}/upload`, fd, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return r.data;
}

export async function listRows(skip=0, limit=200, q="") {
  const r = await axios.get(`${API_BASE}/rows`, { params: { skip, limit, q }});
  return r.data;
}

export async function getRow(id) {
  const r = await axios.get(`${API_BASE}/row/${id}`);
  return r.data;
}

export async function generateRow(id, qa_count=4) {
  const r = await axios.post(`${API_BASE}/generate/${id}`, { qa_count });
  return r.data;
}

export async function saveRow(id, payload) {
  const r = await axios.post(`${API_BASE}/save/${id}`, payload);
  return r.data;
}

export async function downloadCSV() {
  const r = await axios.get(`${API_BASE}/download`, { responseType: "blob" });
  return r.data;
}


// Add to api.js
export async function startBatchProcess(qa_count = 4) {
  const r = await axios.post(`${API_BASE}/process-batch`, { qa_count });
  return r.data;
}

export async function getProcessStatus(processId) {
  const r = await axios.get(`${API_BASE}/process-status/${processId}`);
  return r.data;
}

export async function getAllData() {
  const r = await axios.get(`${API_BASE}/data`);
  return r.data;
}

export async function ensureHeaders(count) {
  const r = await axios.post(`${API_BASE}/ensure_headers/${count}`);
  return r.data;
}
