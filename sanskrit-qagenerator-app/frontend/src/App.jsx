import React, { useEffect, useState } from "react";
import Sidebar from "./components/Sidebar";
import ShlokaEditor from "./components/ShlokaEditor";
import InteractiveBatchProcessor from "./components/InteractiveBatchProcessor";
import { listCsvs, listRows, uploadCSV, downloadCSV, getAllData } from "./api";

export default function App() {
  const [csvs, setCsvs] = useState([]);
  const [selectedCsv, setSelectedCsv] = useState(null);
  const [rows, setRows] = useState([]);
  const [selectedRowId, setSelectedRowId] = useState(null);
  const [query, setQuery] = useState("");
  const [showBatchProcessor, setShowBatchProcessor] = useState(false);
  const [autoProcessOnUpload, setAutoProcessOnUpload] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCsvs();
  }, []);

  useEffect(() => {
    if (selectedCsv) {
      fetchRows();
    }
  }, [selectedCsv, query]);

  async function fetchCsvs() {
    setLoading(true);
    try {
      const data = await listCsvs();
      setCsvs(data);
      if (data.length > 0 && !selectedCsv) {
        setSelectedCsv(data[0]);
      }
    } catch (error) {
      console.error("Failed to fetch CSVs:", error);
      alert("Failed to load CSV list. Is the backend running?");
    } finally {
      setLoading(false);
    }
  }

  async function fetchRows() {
    setLoading(true);
    try {
      const data = await listRows(selectedCsv, 0, 1000, query);
      setRows(data);
      if (data.length > 0 && selectedRowId === null) {
        setSelectedRowId(data[0].id);
      } else if (data.length === 0) {
        setSelectedRowId(null);
      }
    } catch (error) {
      console.error("Failed to fetch rows:", error);
    } finally {
      setLoading(false);
    }
  }

  function handleQueryChange(newQuery) {
    setQuery(newQuery);
  }

  function handleSelectCsv(csv) {
    setSelectedCsv(csv);
    setSelectedRowId(null);
  }

  function handleSelectRow(id) {
    setSelectedRowId(id);
  }

  async function handleUpload(e) {
    const files = e.target.files;
    if (!files) return;
    setLoading(true);
    try {
      for (const file of files) {
        await uploadCSV(file);
      }
      await fetchCsvs();
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
    const data = await getAllData(selectedCsv);
    let content;
    let filename;

    if (format === "csv") {
      const blob = await downloadCSV(selectedCsv);
      const url = window.URL.createObjectURL(new Blob([blob]));
      const a = document.createElement("a");
      a.href = url;
      a.download = selectedCsv;
      document.body.appendChild(a);
      a.click();
      a.remove();
      return;
    } else if (format === "json") {
      content = JSON.stringify(data, null, 2);
      filename = `${selectedCsv}.json`;
    } else if (format === "jsonl") {
      content = data.map(row => JSON.stringify(row)).join('\n');
      filename = `${selectedCsv}.jsonl`;
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
    fetchCsvs();
    setShowBatchProcessor(false);
  };

  return (
    <div className="h-screen flex bg-gray-100">
      <Sidebar
        csvs={csvs}
        selectedCsv={selectedCsv}
        onSelectCsv={handleSelectCsv}
        rows={rows}
        onSelectRow={handleSelectRow}
        selectedRowId={selectedRowId}
        onUpload={handleUpload}
        onRefresh={fetchCsvs}
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
          <InteractiveBatchProcessor
            onComplete={handleBatchComplete}
            onExit={() => setShowBatchProcessor(false)}
          />
        ) : selectedRowId !== null ? (
          <ShlokaEditor
            key={`${selectedCsv}-${selectedRowId}`}
            filename={selectedCsv}
            id={selectedRowId}
            onSaved={fetchRows}
          />
        ) : (
          <div className="text-gray-600">Select a shloka to view.</div>
        )}
      </div>
    </div>
  );
}
