import React, { useState, useEffect } from "react";
import { startBatchProcess, getProcessStatus, saveBatch } from "../api";

export default function BatchProcessor({ onComplete, rowCount }) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [processId, setProcessId] = useState(null);
  const [status, setStatus] = useState(null);
  const [qaCount, setQaCount] = useState(4);
  const [selectedRows, setSelectedRows] = useState([]);

  useEffect(() => {
    let interval;
    if (isProcessing && processId) {
      interval = setInterval(async () => {
        try {
          const statusData = await getProcessStatus(processId);
          setStatus(statusData);
          if (statusData.status === "completed" || statusData.status === "error") {
            setIsProcessing(false);
            clearInterval(interval);
            if (statusData.status === "completed") {
              setSelectedRows(statusData.results.map(r => r.id));
            }
          }
        } catch (error) {
          console.error("Error fetching status:", error);
        }
      }, 2000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isProcessing, processId]);

  const startProcessing = async () => {
    if (!rowCount || rowCount === 0) {
      alert("No rows to process. Please upload a CSV first.");
      return;
    }
    setIsProcessing(true);
    setStatus(null);
    try {
      const response = await startBatchProcess(qaCount);
      setProcessId(response.process_id);
    } catch (error) {
      console.error("Failed to start batch processing:", error);
      alert("Failed to start batch processing: " + error.message);
      setIsProcessing(false);
    }
  };

  const handleSave = async () => {
    const rowsToSave = status.results.filter(r => selectedRows.includes(r.id));
    try {
      await saveBatch(processId, rowsToSave);
      alert("Saved selected rows.");
      if (onComplete) onComplete();
    } catch (error) {
      console.error("Failed to save batch:", error);
      alert("Failed to save batch: " + error.message);
    }
  };

  const handleRowSelection = (rowId) => {
    setSelectedRows(prev =>
      prev.includes(rowId) ? prev.filter(id => id !== rowId) : [...prev, rowId]
    );
  };

  const getProgressPercentage = () => {
    if (!status || status.total_rows === 0) return 0;
    return Math.round((status.current_row / status.total_rows) * 100);
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-sm border">
      <h3 className="text-lg font-semibold mb-4">Batch Process CSV</h3>
      {!status || status.status === "running" ? (
        <div>
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium">QA Count per Row:</label>
            <select
              value={qaCount}
              onChange={e => setQaCount(Number(e.target.value))}
              className="border px-3 py-2 rounded"
              disabled={isProcessing}
            >
              {[...Array(8).keys()].map(i => (
                <option key={i + 3} value={i + 3}>{i + 3}</option>
              ))}
            </select>
            <button
              onClick={startProcessing}
              disabled={isProcessing || !rowCount}
              className={`px-4 py-2 rounded ${isProcessing || !rowCount ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700 text-white'}`}
            >
              {isProcessing ? 'Processing...' : 'Start Batch Process'}
            </button>
          </div>
          {status && (
            <div className="mt-4 p-4 bg-blue-50 rounded border">
              <div className="flex justify-between items-center mb-2">
                <span className="font-medium">Progress:</span>
                <span className="text-sm">{status.current_row} / {status.total_rows} rows ({getProgressPercentage()}%)</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className="bg-green-600 h-2 rounded-full transition-all duration-300" style={{ width: `${getProgressPercentage()}%` }}></div>
              </div>
              <div className="mt-3 text-sm">
                <div><strong>Status:</strong> {status.status}</div>
                {status.current_sanskrit && <div><strong>Current Row:</strong> {status.current_sanskrit}</div>}
                {status.error_message && <div className="text-red-600"><strong>Error:</strong> {status.error_message}</div>}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div>
          <div className="flex justify-between items-center mb-4">
            <h4 className="text-md font-semibold">Review and Save</h4>
            <button
              onClick={handleSave}
              className="px-4 py-2 rounded bg-green-600 hover:bg-green-700 text-white"
            >
              Save Selections to CSV
            </button>
          </div>
          <div className="space-y-4">
            {status.results.map(row => (
              <div key={row.id} className="bg-gray-50 p-4 rounded-lg border">
                <div className="flex items-start gap-4">
                  <input
                    type="checkbox"
                    checked={selectedRows.includes(row.id)}
                    onChange={() => handleRowSelection(row.id)}
                    className="mt-1 h-5 w-5 rounded border-gray-300 text-sky-600 focus:ring-sky-500"
                  />
                  <div>
                    <p className="font-semibold">{row.sanskrit}</p>
                    <p className="text-sm text-gray-600">{row.english}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
