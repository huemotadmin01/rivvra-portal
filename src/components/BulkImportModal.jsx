import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Loader2, UploadCloud, FileSpreadsheet, X, CheckCircle2,
  AlertTriangle, Download, ArrowRight, ArrowLeft,
} from 'lucide-react';

/**
 * BulkImportModal — generic CSV/XLSX import flow (upload → map → result).
 *
 * Entity-agnostic: pass a `fields` config and an `onImport(rows)` callback that
 * hits the entity's bulk-import endpoint. The server is authoritative — this
 * modal only makes mapping/preview pleasant and re-formats the result.
 *
 * Props:
 *  open        — show/hide
 *  onClose     — close handler
 *  title       — e.g. "Import Candidates"
 *  fields      — [{ key, label, required, aliases:[] }]
 *  onImport    — async (rows[]) => { success, summary, results } (server shape)
 *  onDone      — called after a successful import (e.g. reload the list)
 *  templateName— filename for the downloadable template (default "import-template.csv")
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const norm = (s) => (s || '').toString().toLowerCase().replace(/[^a-z0-9]/g, '');

function cellToString(v) {
  if (v == null) return '';
  if (typeof v === 'object') {
    // exceljs rich cells: hyperlink, formula result, rich text, date
    if (v.text != null) return String(v.text);
    if (v.result != null) return String(v.result);
    if (v.hyperlink != null) return String(v.hyperlink);
    if (v instanceof Date) return v.toISOString();
    return '';
  }
  return String(v);
}

// Minimal RFC-4180 CSV parser (quotes, escaped quotes, commas, CRLF).
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n') {
      row.push(field); rows.push(row); row = []; field = '';
    } else if (c !== '\r') {
      field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function downloadCsv(filename, rows) {
  const esc = (c) => {
    const s = (c == null ? '' : String(c));
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = rows.map((r) => r.map(esc).join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function BulkImportModal({
  open, onClose, title, fields, onImport, onDone,
  templateName = 'import-template.csv',
  itemNoun = 'record',
}) {
  const [step, setStep] = useState('upload'); // upload | map | result
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState([]);
  const [dataRows, setDataRows] = useState([]); // array of arrays
  const [mapping, setMapping] = useState({}); // fieldKey -> column index (-1 = unmapped)
  const [parseError, setParseError] = useState('');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  const reset = () => {
    setStep('upload'); setFileName(''); setHeaders([]); setDataRows([]);
    setMapping({}); setParseError(''); setImporting(false); setResult(null);
    setDragOver(false);
  };

  useEffect(() => { if (!open) reset(); }, [open]);

  // Esc to close (not while importing).
  useEffect(() => {
    if (!open) return undefined;
    const h = (e) => { if (e.key === 'Escape' && !importing) onClose?.(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [open, importing, onClose]);

  const autoMap = (hdrs) => {
    const next = {};
    const normHdrs = hdrs.map(norm);
    fields.forEach((f) => {
      const aliases = [f.key, f.label, ...(f.aliases || [])].map(norm);
      let idx = -1;
      for (let i = 0; i < normHdrs.length; i++) {
        if (aliases.includes(normHdrs[i])) { idx = i; break; }
      }
      next[f.key] = idx;
    });
    return next;
  };

  const handleFile = async (file) => {
    if (!file) return;
    setParseError('');
    try {
      const isCsv = /\.csv$/i.test(file.name) || file.type === 'text/csv';
      let allRows;
      if (isCsv) {
        const text = await file.text();
        allRows = parseCSV(text);
      } else {
        // Load exceljs on demand so it never weighs down the list page (and
        // CSV imports never pay for it at all).
        const { default: ExcelJS } = await import('exceljs');
        const buf = await file.arrayBuffer();
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(buf);
        const ws = wb.worksheets[0];
        allRows = [];
        if (ws) ws.eachRow((r) => { allRows.push((r.values || []).slice(1).map(cellToString)); });
      }
      // Drop fully-empty rows.
      allRows = allRows.filter((r) => r.some((c) => (c ?? '').toString().trim() !== ''));
      if (allRows.length < 2) {
        setParseError('The file needs a header row and at least one data row.');
        return;
      }
      const hdrs = allRows[0].map((c) => (c ?? '').toString().trim());
      setHeaders(hdrs);
      setDataRows(allRows.slice(1));
      setMapping(autoMap(hdrs));
      setFileName(file.name);
      setStep('map');
    } catch (e) {
      console.error('Import parse error:', e);
      setParseError('Could not read that file. Make sure it is a valid .csv or .xlsx.');
    }
  };

  // Build mapped row objects from current mapping (skipping all-empty rows).
  const mappedRows = useMemo(() => {
    if (step === 'upload') return [];
    const out = [];
    for (const r of dataRows) {
      const obj = {};
      let any = false;
      for (const f of fields) {
        const idx = mapping[f.key];
        const val = idx != null && idx >= 0 ? (r[idx] ?? '').toString().trim() : '';
        obj[f.key] = val;
        if (val) any = true;
      }
      if (any) out.push(obj);
    }
    return out;
  }, [dataRows, mapping, fields, step]);

  // Client-side preview validation (guidance only; server re-validates).
  // `rows` is the valid/deduped subset — the set actually posted, so the
  // "Import {valid}" button label always matches what gets sent.
  const preview = useMemo(() => {
    const requiredKeys = fields.filter((f) => f.required).map((f) => f.key);
    const emailKey = fields.find((f) => /email/i.test(f.key))?.key;
    let invalid = 0, dupes = 0;
    const rows = [];
    const seen = new Set();
    for (const row of mappedRows) {
      let ok = true;
      for (const k of requiredKeys) if (!row[k]) ok = false;
      if (ok && emailKey && row[emailKey] && !EMAIL_RE.test(row[emailKey].toLowerCase())) ok = false;
      if (!ok) { invalid++; continue; }
      if (emailKey) {
        const e = row[emailKey].toLowerCase();
        if (seen.has(e)) { dupes++; continue; }
        seen.add(e);
      }
      rows.push(row);
    }
    return { valid: rows.length, invalid, dupes, total: mappedRows.length, rows };
  }, [mappedRows, fields]);

  const requiredUnmapped = fields.filter((f) => f.required && (mapping[f.key] == null || mapping[f.key] < 0));

  const handleImport = async () => {
    setImporting(true);
    try {
      const res = await onImport(preview.rows);
      setResult(res);
      setStep('result');
      if (res?.summary?.created > 0) onDone?.();
    } catch (e) {
      setParseError(e?.message || 'Import failed. Please try again.');
    } finally {
      setImporting(false);
    }
  };

  const downloadTemplate = () => {
    const labels = fields.map((f) => f.label + (f.required ? '' : ''));
    const example = fields.map((f) => {
      if (/email/i.test(f.key)) return 'jane@example.com';
      if (/name/i.test(f.key)) return 'Jane Doe';
      if (/phone|mobile/i.test(f.key)) return '+1 555 0100';
      if (/linkedin/i.test(f.key)) return 'https://linkedin.com/in/jane';
      return '';
    });
    downloadCsv(templateName, [labels, example]);
  };

  const downloadErrorReport = () => {
    const rows = [['row', 'email', 'status', 'reason']];
    (result?.results || [])
      .filter((r) => r.status !== 'created')
      .forEach((r) => rows.push([r.row, r.email || '', r.status, r.reason || '']));
    downloadCsv('import-errors.csv', rows);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-2xl bg-dark-900 border border-dark-800 rounded-xl shadow-2xl flex flex-col max-h-[90vh] max-h-[90dvh]">
        {/* Header */}
        <div className="p-5 border-b border-dark-800 flex items-center justify-between">
          <h3 className="text-base font-semibold text-white">{title}</h3>
          <button onClick={onClose} disabled={importing} className="text-dark-400 hover:text-white disabled:opacity-50">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 overflow-y-auto">
          {/* STEP 1 — UPLOAD */}
          {step === 'upload' && (
            <div className="space-y-4">
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files?.[0]); }}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
                  dragOver ? 'border-rivvra-500 bg-rivvra-500/5' : 'border-dark-700 hover:border-dark-600'
                }`}
              >
                <UploadCloud className="w-10 h-10 mx-auto text-dark-400 mb-3" />
                <p className="text-sm text-dark-200 font-medium">Drop a CSV or Excel file here, or click to browse</p>
                <p className="text-xs text-dark-500 mt-1">Accepts .csv and .xlsx</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                  className="hidden"
                  onChange={(e) => handleFile(e.target.files?.[0])}
                />
              </div>
              {parseError && (
                <div className="flex items-start gap-2 text-sm text-red-400 bg-red-950/40 border border-red-900/50 rounded-lg p-3">
                  <AlertTriangle size={16} className="shrink-0 mt-0.5" /> {parseError}
                </div>
              )}
              <button onClick={downloadTemplate} className="text-sm text-rivvra-400 hover:text-rivvra-300 flex items-center gap-1.5">
                <Download size={14} /> Download a template
              </button>
            </div>
          )}

          {/* STEP 2 — MAP */}
          {step === 'map' && (
            <div className="space-y-5">
              <div className="flex items-center gap-2 text-sm text-dark-300">
                <FileSpreadsheet size={16} className="text-dark-400" />
                <span className="text-dark-200">{fileName}</span>
                <span className="text-dark-500">· {dataRows.length} rows</span>
              </div>

              <div>
                <p className="text-xs font-medium text-dark-400 uppercase tracking-wide mb-2">Map your columns</p>
                <div className="space-y-2">
                  {fields.map((f) => (
                    <div key={f.key} className="flex items-center gap-3">
                      <div className="w-40 text-sm text-dark-200">
                        {f.label}{f.required && <span className="text-red-400 ml-0.5">*</span>}
                      </div>
                      <select
                        value={mapping[f.key] ?? -1}
                        onChange={(e) => setMapping((m) => ({ ...m, [f.key]: Number(e.target.value) }))}
                        className="flex-1 bg-dark-800 border border-dark-700 rounded-lg px-3 py-2 text-sm text-dark-100 focus:border-rivvra-500 outline-none"
                      >
                        <option value={-1}>— Not mapped —</option>
                        {headers.map((h, i) => (
                          <option key={i} value={i}>{h || `Column ${i + 1}`}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              {/* Preview counts */}
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-dark-800/60 rounded-lg py-2">
                  <div className="text-lg font-semibold text-emerald-400">{preview.valid}</div>
                  <div className="text-xs text-dark-400">ready</div>
                </div>
                <div className="bg-dark-800/60 rounded-lg py-2">
                  <div className="text-lg font-semibold text-amber-400">{preview.dupes}</div>
                  <div className="text-xs text-dark-400">duplicate in file</div>
                </div>
                <div className="bg-dark-800/60 rounded-lg py-2">
                  <div className="text-lg font-semibold text-red-400">{preview.invalid}</div>
                  <div className="text-xs text-dark-400">invalid</div>
                </div>
              </div>

              {requiredUnmapped.length > 0 && (
                <div className="flex items-start gap-2 text-sm text-amber-400 bg-amber-950/30 border border-amber-900/40 rounded-lg p-3">
                  <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                  Map the required field{requiredUnmapped.length > 1 ? 's' : ''}: {requiredUnmapped.map((f) => f.label).join(', ')}
                </div>
              )}
              <p className="text-xs text-dark-500">
                Duplicate emails (already in your account or repeated in the file) are skipped automatically. The server does the final validation.
              </p>
              {parseError && (
                <div className="flex items-start gap-2 text-sm text-red-400 bg-red-950/40 border border-red-900/50 rounded-lg p-3">
                  <AlertTriangle size={16} className="shrink-0 mt-0.5" /> {parseError}
                </div>
              )}
            </div>
          )}

          {/* STEP 3 — RESULT */}
          {step === 'result' && !result?.summary && (
            // Server responded without a summary (unexpected shape) — say so
            // instead of rendering an empty body under the footer buttons.
            <div className="flex flex-col items-center text-center py-6">
              <AlertTriangle className="w-10 h-10 text-amber-400 mb-2" />
              <p className="text-white font-semibold">Import finished, but no summary was returned</p>
              <p className="text-sm text-dark-400 mt-1">Reload the list to check what was imported.</p>
            </div>
          )}
          {step === 'result' && result?.summary && (
            <div className="space-y-4">
              <div className="flex flex-col items-center text-center py-2">
                <CheckCircle2 className="w-12 h-12 text-emerald-400 mb-2" />
                <p className="text-white font-semibold">Import complete</p>
                <p className="text-sm text-dark-400">{result.summary.created} of {result.summary.total} rows imported</p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                <div className="bg-dark-800/60 rounded-lg py-2">
                  <div className="text-lg font-semibold text-emerald-400">{result.summary.created}</div>
                  <div className="text-xs text-dark-400">created</div>
                </div>
                <div className="bg-dark-800/60 rounded-lg py-2">
                  <div className="text-lg font-semibold text-amber-400">{result.summary.duplicates ?? 0}</div>
                  <div className="text-xs text-dark-400">duplicates</div>
                </div>
                <div className="bg-dark-800/60 rounded-lg py-2">
                  <div className="text-lg font-semibold text-sky-400">{result.summary.capSkipped ?? 0}</div>
                  <div className="text-xs text-dark-400">over plan limit</div>
                </div>
                <div className="bg-dark-800/60 rounded-lg py-2">
                  <div className="text-lg font-semibold text-red-400">{result.summary.failed ?? 0}</div>
                  <div className="text-xs text-dark-400">failed</div>
                </div>
              </div>
              {(result.summary.capSkipped ?? 0) > 0 && (
                <div className="flex items-start gap-2 text-sm text-sky-300 bg-sky-950/30 border border-sky-900/40 rounded-lg p-3">
                  <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                  {result.summary.capSkipped} row(s) weren't imported because you hit your plan's record limit. Upgrade to add more.
                </div>
              )}
              {((result.summary.failed ?? 0) > 0 || (result.summary.skipped ?? 0) > 0) && (
                <button onClick={downloadErrorReport} className="text-sm text-rivvra-400 hover:text-rivvra-300 flex items-center gap-1.5">
                  <Download size={14} /> Download report of skipped/failed rows
                </button>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-dark-800 flex items-center justify-between gap-2">
          <div>
            {step === 'map' && (
              <button
                onClick={() => { reset(); }}
                disabled={importing}
                className="px-3 py-2 rounded-lg text-sm font-medium bg-dark-800 hover:bg-dark-700 text-dark-100 disabled:opacity-50 flex items-center gap-1.5"
              >
                <ArrowLeft size={14} /> Back
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {step !== 'result' ? (
              <button onClick={onClose} disabled={importing} className="px-3 py-2 rounded-lg text-sm font-medium bg-dark-800 hover:bg-dark-700 text-dark-100 disabled:opacity-50">
                Cancel
              </button>
            ) : null}
            {step === 'map' && (
              <button
                onClick={handleImport}
                disabled={importing || requiredUnmapped.length > 0 || preview.valid === 0}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-rivvra-500 hover:bg-rivvra-600 text-white disabled:opacity-50 flex items-center gap-1.5"
              >
                {importing ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />}
                {importing ? 'Importing…' : `Import ${preview.valid} ${itemNoun}${preview.valid === 1 ? '' : 's'}`}
              </button>
            )}
            {step === 'result' && (
              <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium bg-rivvra-500 hover:bg-rivvra-600 text-white">
                Done
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
