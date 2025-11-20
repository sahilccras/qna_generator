import React, { useEffect, useState } from "react";
import Sidebar from "./components/Sidebar";
import ShlokaEditor from "./components/ShlokaEditor";
import BatchProcessor from "./components/BatchProcessor"; // Add this import
import { listRows, uploadCSV, downloadCSV, getAllData } from "./api";

export default function App() {
  const [rows, setRows] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [query, setQuery] = useState("");
  const [showBatchProcessor, setShowBatchProcessor] = useState(false);
  const [autoProcessOnUpload, setAutoProcessOnUpload] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRows();
  }, [query]);

  async function fetchRows() {
    setLoading(true);
    try {
      const data = await listRows(0, 1000, query);
      setRows(data);
      if (data.length > 0 && selectedId === null) {
        setSelectedId(data[0].id);
      } else if (data.length === 0) {
        setSelectedId(null);
      }
    } catch (error) {
      console.error("Failed to fetch rows:", error);
      alert("Failed to load data. Is the backend running?");
    } finally {
      setLoading(false);
    }
  }

  function handleQueryChange(newQuery) {
    setQuery(newQuery);
  }

  function handleSelect(id) {
    setSelectedId(id);
  }

  async function handleUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    setLoading(true);
    try {
      await uploadCSV(file);
      await fetchRows();
      if (autoProcessOnUpload) {
        setShowBatchProcessor(true);
      }
    } catch (error) {
      console.error("Upload failed:", error);
      alert("Upload failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }


  async function handleExport(format) {
    const data = await getAllData(); // This will be a new API endpoint
    let content;
    let filename;

    if (format === "csv") {
      handleDownload();
      return;
    } else if (format === "json") {
      content = JSON.stringify(data, null, 2);
      filename = "data.json";
    } else if (format === "jsonl") {
      content = data.map(row => JSON.stringify(row)).join('\n');
      filename = "data.jsonl";
    }

    const blob = new Blob([content], { type: "application/json" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  const handleBatchComplete = () => {
    // Refresh the data when batch processing completes
    fetchRows();
  };

  return (
    <div className="h-screen flex bg-gray-100">
      <Sidebar
        rows={rows}
        onSelect={handleSelect}
        selectedId={selectedId}
        onUpload={handleUpload}
        onRefresh={fetchRows}
        onShowBatchProcessor={() => setShowBatchProcessor(true)}
        onExport={handleExport}
        onQueryChange={handleQueryChange}
        onAutoProcessChange={setAutoProcessOnUpload}
      />
      <div className="flex-1 p-6 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <p>Loading...</p>
          </div>
        ) : showBatchProcessor ? (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-semibold">Batch CSV Processing</h2>
              <button
                onClick={() => setShowBatchProcessor(false)}
                className="px-4 py-2 border rounded hover:bg-gray-50"
              >
                ← Back to Editor
              </button>
            </div>
            <BatchProcessor 
              onComplete={handleBatchComplete}
              rowCount={rows.length}
            />
          </div>
        ) : selectedId !== null ? (
          <ShlokaEditor id={selectedId} key={selectedId} onSaved={fetchRows} />
        ) : (
          <div className="text-gray-600">No row selected</div>
        )}
      </div>
    </div>
  );
}