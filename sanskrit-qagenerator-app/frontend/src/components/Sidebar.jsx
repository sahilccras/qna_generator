import React, { useState, useRef, useEffect } from "react";

export default function Sidebar({
  rows,
  onSelect,
  selectedId,
  onUpload,
  onRefresh,
  onDownload,
  onShowBatchProcessor,
  onExport,
  onQueryChange,
}) {
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const exportMenuRef = useRef(null);

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
    <div className="w-96 bg-white border-r">
      <div className="p-4 flex items-center justify-between border-b">
        <h2 className="text-lg font-semibold">Shlokas</h2>
        <div className="flex items-center gap-2">
          <label className="bg-sky-600 text-white px-3 py-1 rounded cursor-pointer hover:bg-sky-700">
            Upload
            <input type="file" accept=".csv" className="hidden" onChange={onUpload} />
          </label>
          <button className="px-3 py-1 border rounded hover:bg-gray-50" onClick={onRefresh}>
            Refresh
          </button>
          <div className="relative" ref={exportMenuRef}>
            <button
              className="px-3 py-1 border rounded hover:bg-gray-50 flex items-center gap-1"
              onClick={() => setIsExportMenuOpen(!isExportMenuOpen)}
            >
              Export
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {isExportMenuOpen && (
              <div className="absolute right-0 mt-2 w-32 bg-white rounded-md shadow-lg border z-10">
                <a
                  href="#"
                  onClick={() => handleExport("csv")}
                  className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                >
                  as CSV
                </a>
                <a
                  href="#"
                  onClick={() => handleExport("json")}
                  className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                >
                  as JSON
                </a>
                <a
                  href="#"
                  onClick={() => handleExport("jsonl")}
                  className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                >
                  as JSONL
                </a>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add Batch Process Button */}
      <div className="p-3 border-b bg-blue-50">
        <button
          onClick={onShowBatchProcessor}
          className="w-full bg-green-600 text-white py-2 px-3 rounded hover:bg-green-700 flex items-center justify-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          Auto Process All Rows
        </button>
        <div className="text-xs text-gray-600 mt-1 text-center">
          Automatically generate Q&A for all rows
        </div>
      </div>

      <div className="p-3 border-b">
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by text or tag..."
          className="w-full border rounded-md px-3 py-2 text-sm"
        />
      </div>

      <div className="p-3 overflow-y-auto" style={{ height: 'calc(100vh - 190px)' }}>
        {rows.length === 0 && <div className="text-sm text-gray-500 p-3">No rows. Upload CSV.</div>}
        {rows.map((r) => (
          <div
            key={r.id}
            onClick={() => onSelect(r.id)}
            className={`p-3 mb-2 rounded cursor-pointer ${selectedId === r.id ? 'bg-sky-50 border-l-4 border-sky-500' : 'hover:bg-slate-50'}`}
          >
            <div className="text-sm text-gray-800 leading-snug" style={{ lineHeight: 1.2 }}>
              {r.sanskrit}
            </div>
            <div className="text-xs text-gray-500 mt-1">{r.english}</div>
            {r.tags && (
              <div className="mt-2 flex flex-wrap gap-1">
                {r.tags.split(',').map(tag => (
                  <span key={tag} className="bg-gray-200 text-gray-700 text-xs font-medium px-2 py-0.5 rounded-full">
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}