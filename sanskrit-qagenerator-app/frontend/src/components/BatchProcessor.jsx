import React, { useState, useEffect } from 'react';
import { processBatch } from '../api';

export default function BatchProcessor({ onComplete, filenames }) {
  const [logs, setLogs] = useState([]);
  const [status, setStatus] = useState('idle'); // idle, processing, complete, error
  const [processedFiles, setProcessedFiles] = useState(0);

  useEffect(() => {
    // Automatically start processing when the component mounts
    startProcessing();
  }, []);

  const addLog = (message) => {
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
  };

  const startProcessing = async () => {
    setStatus('processing');
    addLog('Starting batch processing...');

    for (let i = 0; i < filenames.length; i++) {
        const filename = filenames[i];
        if (filename.endsWith('_processed.csv')) {
            addLog(`Skipping already processed file: ${filename}`);
            continue;
        }

        try {
            addLog(`Processing file ${i + 1}/${filenames.length}: ${filename}...`);
            const response = await processBatch(filename);
            addLog(`Successfully processed ${filename}. Output saved to ${response.output_file}.`);
            setProcessedFiles(prev => prev + 1);
        } catch (error) {
            addLog(`Error processing ${filename}: ${error.message}`);
            setStatus('error');
            // Optionally, stop on first error
            // addLog('Batch processing stopped due to an error.');
            // return;
        }
    }

    addLog('Batch processing complete.');
    setStatus('complete');
    onComplete();
  };

  const progressPercentage = (processedFiles / (filenames.length || 1)) * 100;

  return (
    <div className="bg-card p-6 rounded-lg shadow-md border border-border-color max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold text-text-primary mb-4">Autonomous Batch Processing</h2>

      <div className="mb-4">
        <div className="flex justify-between items-center mb-1">
          <span className="text-sm font-medium text-text-primary">
            Status: <span className={`font-bold ${status === 'processing' ? 'text-blue-500' : status === 'complete' ? 'text-green-500' : 'text-red-500'}`}>{status}</span>
          </span>
          <span className="text-sm font-medium text-text-secondary">{processedFiles} / {filenames.length} files</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2.5">
          <div className="bg-primary h-2.5 rounded-full" style={{ width: `${progressPercentage}%` }}></div>
        </div>
      </div>

      <div className="bg-background p-4 rounded-md h-96 overflow-y-auto border border-border-color">
        <h3 className="text-lg font-semibold text-text-primary mb-2">Logs</h3>
        <pre className="text-sm text-text-secondary whitespace-pre-wrap">
          {logs.join('\n')}
        </pre>
      </div>

      {status === 'complete' && (
        <div className="mt-4 text-center">
          <p className="text-green-600 font-semibold">All files processed successfully!</p>
          <button onClick={onComplete} className="mt-2 bg-primary text-white px-4 py-2 rounded-md shadow-sm hover:bg-opacity-90">
            Back to Editor
          </button>
        </div>
      )}
       {status === 'error' && (
        <div className="mt-4 text-center">
          <p className="text-red-600 font-semibold">An error occurred during processing. Check the logs for details.</p>
           <button onClick={onComplete} className="mt-2 bg-primary text-white px-4 py-2 rounded-md shadow-sm hover:bg-opacity-90">
            Back to Editor
          </button>
        </div>
      )}
    </div>
  );
}
