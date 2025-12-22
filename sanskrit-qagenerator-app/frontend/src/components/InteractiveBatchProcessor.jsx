import React, { useState, useEffect } from 'react';
import {
  listCsvs,
  listRows,
  startBatchJob,
  getBatchJob,
  cancelBatchJob,
  commitBatchJob,
  listBatchJobs
} from '../api';

export default function InteractiveBatchProcessor({ onComplete, onExit }) {
  const [step, setStep] = useState('selection'); // selection, processing, review
  const [csvs, setCsvs] = useState([]);
  const [selectedCsv, setSelectedCsv] = useState('');
  const [rows, setRows] = useState([]);
  const [selectedRowIds, setSelectedRowIds] = useState(new Set());
  const [targetCount, setTargetCount] = useState(4);

  const [currentJob, setCurrentJob] = useState(null);
  const [reviewData, setReviewData] = useState(null);
  const [error, setError] = useState(null);

  // Check for active jobs on mount
  useEffect(() => {
    fetchCsvs();
    checkActiveJobs();
  }, []);

  // Poll for job status if we have a current job
  useEffect(() => {
    let interval;
    if (currentJob && (currentJob.status === 'queued' || currentJob.status === 'processing')) {
      interval = setInterval(async () => {
        try {
          const job = await getBatchJob(currentJob.job_id);
          setCurrentJob(job);
          if (job.status === 'completed') {
            setReviewData(job.results);
            setStep('review');
          } else if (job.status === 'failed' || job.status === 'cancelled') {
             // Stay on processing screen but show error/status
          }
        } catch (e) {
          console.error("Polling error", e);
        }
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [currentJob]);

  async function fetchCsvs() {
    try {
      const data = await listCsvs();
      setCsvs(data);
      if (data.length > 0) setSelectedCsv(data[0]);
    } catch (e) {
      setError("Failed to load CSVs");
    }
  }

  async function checkActiveJobs() {
    try {
      const jobs = await listBatchJobs();
      const active = jobs.find(j => j.status === 'processing' || j.status === 'queued');
      if (active) {
        setCurrentJob(active);
        setStep('processing');
      } else {
        // If there's a recently completed job that wasn't committed?
        // For now, let's just let the user start a new one or see the list.
      }
    } catch (e) {
      console.error(e);
    }
  }

  useEffect(() => {
    if (selectedCsv) {
      fetchRows(selectedCsv);
    }
  }, [selectedCsv]);

  async function fetchRows(filename) {
    try {
      // Fetch all rows to allow selection
      // Note: listRows normally paginates. For selection we might need a dedicated endpoint or just fetch enough.
      // For now, let's fetch first 1000.
      const data = await listRows(filename, 0, 1000);
      setRows(data);
      // Default select none? Or select all? Let's default to empty.
      setSelectedRowIds(new Set());
    } catch (e) {
      setError("Failed to fetch rows");
    }
  }

  const handleToggleRow = (id) => {
    const newSet = new Set(selectedRowIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedRowIds(newSet);
  };

  const handleSelectAll = () => {
    if (selectedRowIds.size === rows.length) {
      setSelectedRowIds(new Set());
    } else {
      setSelectedRowIds(new Set(rows.map(r => r.id)));
    }
  };

  const handleStartJob = async () => {
    if (selectedRowIds.size === 0) {
      alert("Please select at least one row.");
      return;
    }
    try {
      const res = await startBatchJob(selectedCsv, Array.from(selectedRowIds), targetCount);
      setCurrentJob({ job_id: res.job_id, status: 'queued', progress: 0, total: selectedRowIds.size });
      setStep('processing');
    } catch (e) {
      setError(e.message);
    }
  };

  const handleCancel = async () => {
    if (!currentJob) return;
    try {
      await cancelBatchJob(currentJob.job_id);
      // Wait for next poll to update status
    } catch (e) {
      console.error(e);
    }
  };

  const handleCommit = async () => {
    if (!currentJob) return;
    try {
      const res = await commitBatchJob(currentJob.job_id);
      alert(`Saved successfully to ${res.path}`);
      if (onComplete) onComplete();
    } catch (e) {
      alert(`Failed to save: ${e.response?.data?.detail || e.message}`);
    }
  };

  // --- Render Steps ---

  if (step === 'selection') {
    return (
      <div className="bg-white rounded-lg shadow p-6 h-full flex flex-col">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-800">New Batch Job</h2>
          <button onClick={onExit} className="text-gray-500 hover:text-gray-700">✕</button>
        </div>

        <div className="flex gap-4 mb-6">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Select File</label>
            <select
              value={selectedCsv}
              onChange={e => setSelectedCsv(e.target.value)}
              className="w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
            >
              {csvs.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div className="w-32">
            <label className="block text-sm font-medium text-gray-700 mb-1">Target Q&A</label>
            <input
              type="number"
              value={targetCount}
              onChange={e => setTargetCount(parseInt(e.target.value))}
              className="w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
              min="1" max="10"
            />
          </div>
        </div>

        <div className="flex-1 overflow-auto border rounded-md mb-4">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <input
                    type="checkbox"
                    checked={rows.length > 0 && selectedRowIds.size === rows.length}
                    onChange={handleSelectAll}
                    className="rounded text-indigo-600 focus:ring-indigo-500"
                  />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sanskrit Start</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {rows.map(row => (
                <tr key={row.id} className={selectedRowIds.has(row.id) ? "bg-indigo-50" : ""}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={selectedRowIds.has(row.id)}
                      onChange={() => handleToggleRow(row.id)}
                      className="rounded text-indigo-600 focus:ring-indigo-500"
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{row.id}</td>
                  <td className="px-6 py-4 text-sm text-gray-900">{row.sanskrit.substring(0, 50)}...</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-600">{selectedRowIds.size} rows selected</span>
          <button
            onClick={handleStartJob}
            className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 shadow-sm"
          >
            Start Processing
          </button>
        </div>
      </div>
    );
  }

  if (step === 'processing') {
    const percentage = currentJob ? Math.round((currentJob.progress / (currentJob.total || 1)) * 100) : 0;

    return (
      <div className="bg-white rounded-lg shadow p-8 h-full flex flex-col items-center justify-center">
        <h2 className="text-2xl font-bold mb-4">Processing Batch Job</h2>
        <p className="text-gray-600 mb-8">Processing {currentJob?.filename}...</p>

        <div className="w-full max-w-md bg-gray-200 rounded-full h-4 mb-2">
          <div
            className="bg-indigo-600 h-4 rounded-full transition-all duration-500"
            style={{ width: `${percentage}%` }}
          ></div>
        </div>
        <div className="flex justify-between w-full max-w-md text-sm text-gray-500 mb-8">
          <span>{currentJob?.progress} / {currentJob?.total}</span>
          <span>{percentage}%</span>
        </div>

        {currentJob?.status === 'cancelled' && (
           <div className="text-red-500 font-bold mb-4">Cancelled</div>
        )}

        <div className="flex gap-4">
           {currentJob?.status === 'processing' || currentJob?.status === 'queued' ? (
             <button
               onClick={handleCancel}
               className="bg-white border border-red-300 text-red-600 px-4 py-2 rounded-md hover:bg-red-50"
             >
               Cancel
             </button>
           ) : (
             <button
               onClick={() => setStep('selection')}
               className="bg-gray-100 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-200"
             >
               Back
             </button>
           )}
        </div>
      </div>
    );
  }

  if (step === 'review') {
    return (
      <div className="h-full flex flex-col bg-gray-50">
        <div className="bg-white shadow px-6 py-4 flex justify-between items-center z-10">
          <h2 className="text-xl font-bold">Review Generated Data</h2>
          <div className="flex gap-3">
            <button
              onClick={() => setStep('selection')}
              className="text-gray-600 px-4 py-2 hover:bg-gray-100 rounded-md"
            >
              Discard & Restart
            </button>
            <button
              onClick={handleCommit}
              className="bg-green-600 text-white px-6 py-2 rounded-md hover:bg-green-700 shadow-sm"
            >
              Save to File
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6 space-y-6">
          {Object.entries(reviewData || {}).map(([rowId, data]) => (
            <div key={rowId} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
               <div className="flex justify-between items-start mb-4 border-b pb-4">
                  <div>
                    <span className="text-xs font-bold text-indigo-600 uppercase tracking-wide">Row {rowId}</span>
                    <p className="mt-1 text-gray-800 font-serif">{data.original_sanskrit}</p>
                    <p className="mt-1 text-gray-500 text-sm">{data.original_english}</p>
                  </div>
               </div>

               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {data.generated_qas.q_en.map((q, i) => (
                    <div key={i} className="bg-gray-50 p-4 rounded border border-gray-100">
                        <p className="font-semibold text-gray-700 mb-1">Q: {q}</p>
                        <p className="text-gray-600">A: {data.generated_qas.a_en[i]}</p>
                        <div className="mt-2 text-xs text-gray-400 flex gap-2">
                           <span>Hi: {data.generated_qas.q_hi[i]}</span>
                           <span>Sa: {data.generated_qas.q_sa[i]}</span>
                        </div>
                    </div>
                  ))}
               </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return null;
}
