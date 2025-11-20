import React, { useState, useRef, useEffect } from "react";

export default function Sidebar({
  rows,
  onSelect,
  selectedId,
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

  // Debounce the query change
  useEffect(() => {
    const handler = setTimeout(() => {
      onQueryChange(filter);
    }, 500); // 500ms debounce
    return () => clearTimeout(handler);
  }, [filter, onQueryChange]);

  // Close the export menu if clicking outside of it
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
      {/* Header */}
      <div className="p-4 border-b border-border-color">
        <h1 className="text-xl font-bold text-text-primary">Sanskrit Q&A</h1>
        <p className="text-sm text-text-secondary">Dataset Creation Tool</p>
      </div>

      {/* Actions */}
      <div className="p-4 border-b border-border-color">
        <div className="grid grid-cols-2 gap-2">
          <label className="bg-primary text-white px-3 py-2 rounded-md cursor-pointer hover:bg-opacity-90 text-sm font-medium flex items-center justify-center gap-2">
            <IconUpload /> Upload CSV
            <input type="file" accept=".csv" className="hidden" onChange={onUpload} />
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

      {/* Batch & Export */}
      <div className="p-4 border-b border-border-color">
        <button
          onClick={onShowBatchProcessor}
          className="w-full bg-secondary text-text-primary py-2 px-3 rounded-md hover:bg-opacity-90 flex items-center justify-center gap-2 text-sm font-medium"
        >
          <IconZap />
          Batch Process All Rows
        </button>
        <div className="relative mt-2" ref={exportMenuRef}>
          <button
            className="w-full px-3 py-2 border border-border-color rounded-md hover:bg-background text-sm font-medium flex items-center justify-center gap-2"
            onClick={() => setIsExportMenuOpen(!isExportMenuOpen)}
          >
            <IconDownload /> Export Dataset
            <IconChevronDown open={isExportMenuOpen} />
          </button>
          {isExportMenuOpen && (
            <div className="absolute right-0 mt-1 w-full bg-sidebar rounded-md shadow-lg border border-border-color z-10">
              <a href="#" onClick={() => handleExport("csv")} className="block px-4 py-2 text-sm text-text-primary hover:bg-background">Export as CSV</a>
              <a href="#" onClick={() => handleExport("json")} className="block px-4 py-2 text-sm text-text-primary hover:bg-background">Export as JSON</a>
              <a href="#" onClick={() => handleExport("jsonl")} className="block px-4 py-2 text-sm text-text-primary hover:bg-background">Export as JSONL</a>
            </div>
          )}
        </div>
      </div>

      {/* Filter */}
      <div className="p-4 border-b border-border-color">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <IconSearch />
          </div>
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by text or tag..."
            className="w-full border border-border-color rounded-md pl-10 pr-4 py-2 text-sm"
          />
        </div>
      </div>

      {/* Shloka List */}
      <div className="flex-grow p-2 overflow-y-auto">
        {rows.length === 0 ? (
          <div className="text-sm text-text-secondary p-4 text-center">
            <p className="font-semibold">No data</p>
            <p>Upload a CSV to get started.</p>
          </div>
        ) : (
          rows.map((r) => (
            <div
              key={r.id}
              onClick={() => onSelect(r.id)}
              className={`p-3 mb-1 rounded-md cursor-pointer ${
                selectedId === r.id
                  ? 'bg-secondary border-l-4 border-primary'
                  : 'hover:bg-background'
              }`}
            >
              <p className="text-sm font-medium text-text-primary truncate">{r.sanskrit}</p>
              <p className="text-xs text-text-secondary mt-1 truncate">{r.english}</p>
              {r.tags && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {r.tags.split(',').map(tag => (
                    <span key={tag} className="bg-accent bg-opacity-20 text-accent text-xs font-medium px-2 py-0.5 rounded-full">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// SVG Icons for a cleaner look
const IconUpload = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>;
const IconRefresh = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h5M20 20v-5h-5" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4l16 16" /></svg>;
const IconZap = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>;
const IconDownload = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>;
const IconSearch = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>;
const IconChevronDown = ({ open }) => <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 transition-transform ${open ? 'transform rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>;