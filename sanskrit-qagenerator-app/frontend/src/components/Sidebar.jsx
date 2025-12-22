import React, { useState, useRef, useEffect } from "react";

export default function Sidebar({
  csvs,
  selectedCsv,
  onSelectCsv,
  rows,
  onSelectRow,
  selectedRowId,
  onUpload,
  onRefresh,
  onShowBatchProcessor,
  onExport,
  onQueryChange,
  onAutoProcessChange,
}) {
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [autoProcess, setAutoProcess] = useState(false);
  const exportMenuRef = useRef(null);

  useEffect(() => {
    onAutoProcessChange(autoProcess);
  }, [autoProcess, onAutoProcessChange]);

  useEffect(() => {
    const handler = setTimeout(() => {
      onQueryChange(filter);
    }, 500);
    return () => clearTimeout(handler);
  }, [filter, onQueryChange]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target)) {
        setIsExportMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [exportMenuRef]);

  const handleExport = (format) => {
    onExport(format);
    setIsExportMenuOpen(false);
  };

  return (
    <div className="w-96 bg-sidebar border-r border-border-color flex flex-col">
      <div className="p-4 border-b border-border-color">
        <h1 className="text-xl font-bold text-text-primary">Sanskrit Q&A</h1>
        <p className="text-sm text-text-secondary">Dataset Creation Tool</p>
      </div>

      <div className="p-4 border-b border-border-color">
        <div className="grid grid-cols-2 gap-2">
          <label className="bg-primary text-white px-3 py-2 rounded-md cursor-pointer hover:bg-opacity-90 text-sm font-medium flex items-center justify-center gap-2">
            <IconUpload /> Upload CSV
            <input type="file" accept=".csv" className="hidden" onChange={onUpload} multiple />
          </label>
          <button
            className="px-3 py-2 border border-border-color rounded-md hover:bg-background text-sm font-medium flex items-center justify-center gap-2"
            onClick={onRefresh}
          >
            <IconRefresh /> Refresh
          </button>
        </div>
        <div className="mt-3 flex items-center gap-2 text-sm">
          <input
            id="autoProcess"
            type="checkbox"
            checked={autoProcess}
            onChange={(e) => setAutoProcess(e.target.checked)}
            className="h-4 w-4 rounded border-border-color text-primary focus:ring-primary"
          />
          <label htmlFor="autoProcess" className="font-medium text-text-primary">
            Auto-process on upload
          </label>
        </div>
      </div>

      <div className="p-4 border-b border-border-color">
        <h2 className="text-lg font-semibold text-text-primary mb-2">CSV Files</h2>
        <div className="space-y-1 max-h-32 overflow-y-auto">
          {csvs.map((csv) => (
            <div
              key={csv}
              onClick={() => onSelectCsv(csv)}
              className={`p-2 rounded-md cursor-pointer text-sm font-medium ${
                selectedCsv === csv ? 'bg-secondary text-text-primary' : 'hover:bg-background'
              }`}
            >
              {csv}
            </div>
          ))}
        </div>
      </div>

      <div className="p-4 border-b border-border-color">
        <button
          onClick={onShowBatchProcessor}
          className="w-full bg-secondary text-text-primary py-2 px-3 rounded-md hover:bg-opacity-90 flex items-center justify-center gap-2 text-sm font-medium"
        >
          <IconZap />
          Dataset Generator
        </button>
      </div>

      <div className="p-4 border-b border-border-color">
        <div className="relative">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                <IconSearch />
            </span>
            <input
            type="text"
            placeholder="Filter shlokas..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full bg-background border border-border-color rounded-md pl-10 pr-4 py-2 text-sm focus:ring-primary focus:border-primary"
            />
        </div>
      </div>

      <div className="flex-grow p-2 overflow-y-auto">
        <h2 className="text-lg font-semibold text-text-primary p-2">Shlokas</h2>
        {rows.length === 0 ? (
          <div className="text-sm text-text-secondary p-4 text-center">
            <p>Select a CSV file to view its content.</p>
          </div>
        ) : (
          rows.map((r) => (
            <div
              key={r.id}
              onClick={() => onSelectRow(r.id)}
              className={`p-3 mb-1 rounded-md cursor-pointer ${
                selectedRowId === r.id
                  ? 'bg-secondary border-l-4 border-primary'
                  : 'hover:bg-background'
              }`}
            >
              <p className="text-sm font-medium text-text-primary truncate">{r.sanskrit}</p>
              <p className="text-xs text-text-secondary mt-1 truncate">{r.english}</p>
            </div>
          ))
        )}
      </div>

      <div className="p-4 border-t border-border-color">
        <div className="relative" ref={exportMenuRef}>
            <button
                onClick={() => setIsExportMenuOpen(!isExportMenuOpen)}
                className="w-full bg-secondary text-text-primary py-2 px-3 rounded-md hover:bg-opacity-90 flex items-center justify-center gap-2 text-sm font-medium"
                disabled={!selectedCsv}
            >
                <IconDownload />
                Export {selectedCsv || 'Data'}
                <IconChevronDown open={isExportMenuOpen} />
            </button>
            {isExportMenuOpen && (
                <div className="absolute bottom-full mb-2 w-full bg-sidebar border border-border-color rounded-md shadow-lg z-10">
                    <a onClick={() => handleExport('csv')} className="block px-4 py-2 text-sm text-text-primary hover:bg-background cursor-pointer">Export as CSV</a>
                    <a onClick={() => handleExport('json')} className="block px-4 py-2 text-sm text-text-primary hover:bg-background cursor-pointer">Export as JSON</a>
                    <a onClick={() => handleExport('jsonl')} className="block px-4 py-2 text-sm text-text-primary hover:bg-background cursor-pointer">Export as JSONL</a>
                </div>
            )}
        </div>
      </div>
    </div>
  );
}

const IconUpload = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>;
const IconRefresh = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h5M20 20v-5h-5" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4l16 16" /></svg>;
const IconZap = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>;
const IconDownload = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>;
const IconSearch = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>;
const IconChevronDown = ({ open }) => <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 transition-transform ${open ? 'transform rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>;
