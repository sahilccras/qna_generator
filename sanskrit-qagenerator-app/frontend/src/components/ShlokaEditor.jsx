import React, { useEffect, useState } from "react";
import { getRow, generateRow, saveRow, ensureHeaders } from "../api";

export default function ShlokaEditor({ id, onSaved }) {
  const [row, setRow] = useState(null);
  const [loading, setLoading] = useState(false);
  const [qaCount, setQaCount] = useState(4);
  const [autoGenerate, setAutoGenerate] = useState(false);
  const [generated, setGenerated] = useState(null);
  const [selectedQA, setSelectedQA] = useState([]);

  // Auto-generate handler
  useEffect(() => {
    if (autoGenerate && row?.sanskrit && row?.english) {
      const handler = setTimeout(() => {
        handleGenerate();
      }, 1500); // 1.5s debounce
      return () => clearTimeout(handler);
    }
  }, [autoGenerate, row?.sanskrit, row?.english]);

  useEffect(() => {
    loadRow();
  }, [id]);

  async function loadRow() {
    setLoading(true);
    const data = await getRow(id);
    setRow({
      ...data,
      tags: data.tags ? data.tags.split(',').map(t => t.trim()) : []
    });
    setGenerated(null);
    setLoading(false);
  }

  async function handleGenerate() {
    setLoading(true);
    try {
      const out = await generateRow(id, qaCount);
      await ensureHeaders(qaCount);
      setGenerated(out);
      // By default, all generated QAs are selected
      setSelectedQA(
        Array(out.q_en.length)
          .fill(true)
          .map((_, i) => i)
      );
    } catch (e) {
      alert("Generation failed: " + (e?.message || e));
    }
    setLoading(false);
  }

  function handleQASelection(idx) {
    setSelectedQA((prev) =>
      prev.includes(idx)
        ? prev.filter((i) => i !== idx)
        : [...prev, idx]
    );
  }

  function updateGenerated(langKey, idx, value) {
    setGenerated((prev) => {
      const copy = { ...prev };
      copy[langKey][idx] = value;
      return copy;
    });
  }

  async function handleSave() {
    const payload = {
      ...row,
      tags: row.tags.join(','),
    };

    if (generated && selectedQA.length > 0) {
      for (const key in generated) {
        payload[key] = generated[key].filter((_, i) => selectedQA.includes(i));
      }
    }

    setLoading(true);
    try {
      await saveRow(id, payload);
      alert("Saved.");
      onSaved();
    } catch (e) {
      alert("Save failed: " + (e?.message || e));
    }
    setLoading(false);
  }

  function handleTextChange(field, value) {
    setRow((prev) => ({ ...prev, [field]: value }));
  }

  function handleAddTag(e) {
    if (e.key === 'Enter' && e.target.value) {
      const newTag = e.target.value.trim();
      if (newTag && !row.tags.includes(newTag)) {
        setRow(prev => ({ ...prev, tags: [...prev.tags, newTag] }));
      }
      e.target.value = "";
    }
  }

  function handleRemoveTag(tagToRemove) {
    setRow(prev => ({ ...prev, tags: prev.tags.filter(tag => tag !== tagToRemove) }));
  }

  if (loading && !row) {
    return <Spinner />;
  }
  if (!row) {
    return <div className="text-text-secondary p-8">Select an item from the sidebar to begin.</div>;
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Source Text Card */}
      <div className="bg-card p-6 rounded-lg shadow-md border border-border-color">
        <h2 className="text-xl font-bold text-text-primary mb-4">Source Text</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="sanskrit" className="block text-sm font-medium text-text-primary mb-1">Sanskrit</label>
            <textarea id="sanskrit" value={row.sanskrit} onChange={(e) => handleTextChange("sanskrit", e.target.value)} className="w-full border-border-color rounded-md shadow-sm p-2" rows={4} />
          </div>
          <div>
            <label htmlFor="english" className="block text-sm font-medium text-text-primary mb-1">English</label>
            <textarea id="english" value={row.english} onChange={(e) => handleTextChange("english", e.target.value)} className="w-full border-border-color rounded-md shadow-sm p-2" rows={4} />
          </div>
        </div>
      </div>

      {/* Tags Card */}
      <div className="bg-card p-6 rounded-lg shadow-md border border-border-color">
        <h3 className="text-lg font-bold text-text-primary mb-3">Metadata & Tags</h3>
        <div className="flex flex-wrap items-center gap-2">
          {row.tags && row.tags.map(tag => (
            <div key={tag} className="flex items-center bg-accent bg-opacity-20 text-accent text-sm font-medium px-3 py-1 rounded-full">
              {tag}
              <button onClick={() => handleRemoveTag(tag)} className="ml-2 text-accent hover:font-bold">&times;</button>
            </div>
          ))}
        </div>
        <input id="tags" type="text" onKeyDown={handleAddTag} placeholder="Add a tag and press Enter" className="mt-3 block w-full border-border-color rounded-md shadow-sm p-2" />
      </div>

      {/* Generation Controls Card */}
      <div className="bg-card p-6 rounded-lg shadow-md border border-border-color">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <label htmlFor="qaCount" className="text-sm font-medium text-text-primary">Questions:</label>
              <input id="qaCount" type="number" value={qaCount} onChange={(e) => setQaCount(Number(e.target.value))} className="w-20 border-border-color rounded-md shadow-sm p-2" min="1" max="10" />
            </div>
            <div className="flex items-center gap-2">
              <input id="autoGenerate" type="checkbox" checked={autoGenerate} onChange={(e) => setAutoGenerate(e.target.checked)} className="h-4 w-4 rounded border-border-color text-primary focus:ring-primary" />
              <label htmlFor="autoGenerate" className="text-sm font-medium text-text-primary">Auto-generate</label>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="bg-primary text-white px-4 py-2 rounded-md shadow-sm hover:bg-opacity-90 disabled:bg-opacity-50 flex items-center gap-2" onClick={handleGenerate} disabled={loading}>
              {loading ? <Spinner small /> : <IconZap />} {loading ? "Generating..." : "Generate"}
            </button>
            <button className="border border-border-color px-4 py-2 rounded-md shadow-sm hover:bg-background disabled:opacity-50 flex items-center gap-2" onClick={handleSave} disabled={loading}>
              <IconSave /> Save
            </button>
          </div>
        </div>
      </div>

      {/* Generated Q&A */}
      {generated ? (
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-text-primary">Generated Q&A</h2>
          {generated.q_en.map((_, i) => (
            <div key={i} className="bg-card p-4 rounded-lg shadow-md border border-border-color flex items-start gap-4">
              <input type="checkbox" checked={selectedQA.includes(i)} onChange={() => handleQASelection(i)} className="mt-1 h-5 w-5 rounded border-border-color text-primary focus:ring-primary" />
              <div className="flex-grow grid grid-cols-1 md:grid-cols-3 gap-4">
                {["en", "hi", "sa"].map((lang) => (
                  <div key={lang}>
                    <h4 className="font-semibold text-text-primary capitalize mb-2">{lang === "en" ? "English" : lang === "hi" ? "Hindi" : "Sanskrit"}</h4>
                    <div className="space-y-2">
                      <textarea value={generated[`q_${lang}`][i]} onChange={(e) => updateGenerated(`q_${lang}`, i, e.target.value)} className="w-full border-border-color rounded-md p-2 text-sm" rows={3} placeholder={`Question ${i + 1}`} />
                      <textarea value={generated[`a_${lang}`][i]} onChange={(e) => updateGenerated(`a_${lang}`, i, e.target.value)} className="w-full border-border-color rounded-md p-2 text-sm" rows={4} placeholder={`Answer ${i + 1}`} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center text-text-secondary p-8 bg-card rounded-lg shadow-md border border-border-color">
          <p className="font-semibold">No Q&A Generated</p>
          <p>Click "Generate" to create question-answer pairs.</p>
        </div>
      )}
    </div>
  );
}

const Spinner = ({ small }) => (
  <svg className={`animate-spin ${small ? 'h-4 w-4' : 'h-8 w-8'} text-white`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
  </svg>
);
const IconZap = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>;
const IconSave = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>;
