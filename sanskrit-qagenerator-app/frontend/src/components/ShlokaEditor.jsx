import React, { useEffect, useState } from "react";
import { getRow, generateRow, saveRow } from "../api";

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

  if (loading || !row) {
    return <div className="text-gray-600">Loading...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold">Shloka Editor</h1>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white p-4 rounded-lg shadow-sm">
            <label
              htmlFor="sanskrit"
              className="block text-sm font-medium text-gray-700"
            >
              Sanskrit
            </label>
            <textarea
              id="sanskrit"
              value={row.sanskrit}
              onChange={(e) => handleTextChange("sanskrit", e.target.value)}
              className="mt-1 block w-full border rounded-md p-2 shadow-sm"
              rows={4}
            />
          </div>
          <div className="bg-white p-4 rounded-lg shadow-sm">
            <label
              htmlFor="english"
              className="block text-sm font-medium text-gray-700"
            >
              English
            </label>
            <textarea
              id="english"
              value={row.english}
              onChange={(e) => handleTextChange("english", e.target.value)}
              className="mt-1 block w-full border rounded-md p-2 shadow-sm"
              rows={4}
            />
          </div>
        </div>
      </div>

      <div className="mb-4 bg-white p-4 rounded-lg shadow-sm">
        <label htmlFor="tags" className="block text-sm font-medium text-gray-700">Tags</label>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {row.tags && row.tags.map(tag => (
            <div key={tag} className="flex items-center bg-sky-100 text-sky-800 text-sm font-medium px-2.5 py-0.5 rounded-full">
              {tag}
              <button onClick={() => handleRemoveTag(tag)} className="ml-1.5 text-sky-600 hover:text-sky-800">
                &times;
              </button>
            </div>
          ))}
        </div>
        <input
          id="tags"
          type="text"
          onKeyDown={handleAddTag}
          placeholder="Add a tag and press Enter"
          className="mt-2 block w-full border rounded-md p-2 shadow-sm"
        />
      </div>

      <div className="mb-4 flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <label htmlFor="qaCount" className="text-sm font-medium">
            Questions to generate:
          </label>
          <input
            id="qaCount"
            type="number"
            value={qaCount}
            onChange={(e) => setQaCount(Number(e.target.value))}
            className="w-20 border px-2 py-1 rounded-md shadow-sm"
            min="1"
            max="10"
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            id="autoGenerate"
            type="checkbox"
            checked={autoGenerate}
            onChange={(e) => setAutoGenerate(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-sky-600 focus:ring-sky-500"
          />
          <label htmlFor="autoGenerate" className="text-sm font-medium">
            Auto-generate on edit
          </label>
        </div>
        <div className="flex-grow"></div>
        <button
          className="bg-sky-600 text-white px-4 py-2 rounded-md shadow-sm hover:bg-sky-700 disabled:bg-sky-300"
          onClick={handleGenerate}
          disabled={loading}
        >
          {loading ? "Generating..." : "Generate"}
        </button>
        <button
          className="border px-4 py-2 rounded-md shadow-sm hover:bg-gray-50 disabled:bg-gray-200"
          onClick={handleSave}
          disabled={loading}
        >
          Save
        </button>
      </div>

      {generated ? (
        <div className="space-y-6">
        <div className="space-y-4">
          {generated.q_en.map((_, i) => (
            <div
              key={i}
              className="bg-white p-4 rounded-lg shadow-sm border"
            >
              <div className="flex items-start gap-4">
                <input
                  type="checkbox"
                  checked={selectedQA.includes(i)}
                  onChange={() => handleQASelection(i)}
                  className="mt-1 h-4 w-4 rounded border-gray-300 text-sky-600 focus:ring-sky-500"
                />
                <div className="flex-grow grid grid-cols-1 md:grid-cols-2 gap-4">
                  {["en", "hi", "sa"].map((lang) => (
                    <div key={lang}>
                      <h4 className="font-semibold text-gray-800 capitalize mb-2">
                        {lang === "en"
                          ? "English"
                          : lang === "hi"
                          ? "Hindi"
                          : "Sanskrit"}
                      </h4>
                      <div className="space-y-2">
                        <textarea
                          value={generated[`q_${lang}`][i]}
                          onChange={(e) =>
                            updateGenerated(`q_${lang}`, i, e.target.value)
                          }
                          className="w-full border rounded p-2 text-sm"
                          rows={2}
                          placeholder={`Question ${i + 1}`}
                        />
                        <textarea
                          value={generated[`a_${lang}`][i]}
                          onChange={(e) =>
                            updateGenerated(`a_${lang}`, i, e.target.value)
                          }
                          className="w-full border rounded p-2 text-sm"
                          rows={3}
                          placeholder={`Answer ${i + 1}`}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                  </div>
                </div>
          ))}
            </div>
        </div>
      ) : (
        <div className="text-gray-500">No generated Q&A yet. Click Generate.</div>
      )}
    </div>
  );
}
