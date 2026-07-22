import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { parseDelimited, autoMatchColumn } from '../lib/csv';

export interface ImportField {
  key: string;
  label: string;
  required?: boolean;
  aliases: string[];
}

interface Props {
  title: string;
  fields: ImportField[];
  helpText?: string;
  // Page-specific controls (e.g. a fallback value for a field that's often
  // left out of the pasted data) rendered between the column mapping and
  // the row preview. Generic here so this component doesn't need to know
  // what any particular caller wants to default.
  extraContent?: ReactNode;
  onClose: () => void;
  onImportRow: (values: Record<string, string>, rowNumber: number) => Promise<void>;
  onDone: () => void;
}

interface Failure {
  row: number;
  message: string;
}

export default function ImportModal({ title, fields, helpText, extraContent, onClose, onImportRow, onDone }: Props) {
  const [text, setText] = useState('');
  const [mapping, setMapping] = useState<Record<string, number>>({});
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<{ success: number; failures: Failure[] } | null>(null);

  const parsed = useMemo(() => parseDelimited(text), [text]);
  const dataRows = useMemo(() => parsed.rows.filter((r) => r.some((c) => c.trim() !== '')), [parsed]);

  useEffect(() => {
    if (parsed.headers.length === 0) {
      setMapping({});
      return;
    }
    const next: Record<string, number> = {};
    for (const f of fields) {
      next[f.key] = autoMatchColumn(parsed.headers, f.aliases);
    }
    setMapping(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsed.headers.join('|')]);

  const missingRequired = fields.filter((f) => f.required && (mapping[f.key] ?? -1) < 0);

  const valuesForRow = (row: string[]): Record<string, string> => {
    const values: Record<string, string> = {};
    for (const f of fields) {
      const colIdx = mapping[f.key];
      values[f.key] = colIdx != null && colIdx >= 0 ? (row[colIdx] ?? '').trim() : '';
    }
    return values;
  };

  const handleImport = async () => {
    setImporting(true);
    setResults(null);
    const failures: Failure[] = [];
    let success = 0;

    for (let i = 0; i < dataRows.length; i++) {
      setProgress(i + 1);
      const rowNumber = i + 2; // account for the header row, 1-indexed
      const values = valuesForRow(dataRows[i]);
      const missingField = fields.find((f) => f.required && !values[f.key]);
      if (missingField) {
        failures.push({ row: rowNumber, message: `${missingField.label} is required` });
        continue;
      }
      try {
        await onImportRow(values, rowNumber);
        success++;
      } catch (e) {
        failures.push({ row: rowNumber, message: e instanceof Error ? e.message : 'Import failed' });
      }
    }

    setResults({ success, failures });
    setImporting(false);
    onDone();
  };

  return (
    <div className="modal-backdrop" onClick={importing ? undefined : onClose}>
      <div className="modal" style={{ width: 640 }} onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>

        {!results && (
          <>
            <div className="field">
              <label>Paste data from a spreadsheet (include the header row)</label>
              <textarea
                rows={6}
                style={{ fontFamily: 'monospace', fontSize: 12 }}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={helpText ?? 'Copy cells from Excel/Google Sheets and paste here…'}
                autoFocus
              />
            </div>

            {parsed.headers.length > 0 && (
              <>
                <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 8 }}>
                  Detected {parsed.headers.length} column{parsed.headers.length === 1 ? '' : 's'}, {dataRows.length} data row
                  {dataRows.length === 1 ? '' : 's'}. Match your columns to the fields below.
                </div>

                <div className="card" style={{ padding: 12, marginBottom: 16 }}>
                  {fields.map((f) => (
                    <div className="row" key={f.key} style={{ marginBottom: 8, alignItems: 'center' }}>
                      <div style={{ flex: '0 0 140px', fontSize: 13 }}>
                        {f.label}
                        {f.required && <span style={{ color: 'var(--danger)' }}> *</span>}
                      </div>
                      <select
                        style={{ flex: 1 }}
                        value={mapping[f.key] ?? -1}
                        onChange={(e) => setMapping((m) => ({ ...m, [f.key]: Number(e.target.value) }))}
                      >
                        <option value={-1}>— Don't import —</option>
                        {parsed.headers.map((h, idx) => (
                          <option key={idx} value={idx}>
                            Column: {h || `(${idx + 1})`}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>

                {extraContent}

                {dataRows.length > 0 && (
                  <div style={{ marginBottom: 16, maxHeight: 180, overflow: 'auto' }} className="card">
                    <table>
                      <thead>
                        <tr>
                          {fields.map((f) => (
                            <th key={f.key}>{f.label}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {dataRows.slice(0, 5).map((row, i) => {
                          const values = valuesForRow(row);
                          return (
                            <tr key={i}>
                              {fields.map((f) => (
                                <td key={f.key} style={{ fontSize: 12 }}>
                                  {values[f.key]}
                                </td>
                              ))}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {dataRows.length > 5 && (
                      <div style={{ padding: 8, fontSize: 12, color: 'var(--text-dim)' }}>
                        …and {dataRows.length - 5} more row{dataRows.length - 5 === 1 ? '' : 's'}
                      </div>
                    )}
                  </div>
                )}

                {missingRequired.length > 0 && (
                  <div style={{ color: 'var(--danger)', marginBottom: 12, fontSize: 13 }}>
                    Map a column for: {missingRequired.map((f) => f.label).join(', ')}
                  </div>
                )}
              </>
            )}
          </>
        )}

        {importing && (
          <div style={{ padding: 12 }}>
            Importing {progress} / {dataRows.length}…
          </div>
        )}

        {results && (
          <div style={{ padding: 4 }}>
            <div style={{ marginBottom: 8 }}>
              Imported <strong>{results.success}</strong> of {dataRows.length} row{dataRows.length === 1 ? '' : 's'}.
            </div>
            {results.failures.length > 0 && (
              <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                {results.failures.map((f, i) => (
                  <div key={i} style={{ color: 'var(--danger)', fontSize: 13 }}>
                    Row {f.row}: {f.message}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="modal-actions">
          <div />
          <div className="right">
            {results ? (
              <button className="btn btn-primary" onClick={onClose}>
                Done
              </button>
            ) : (
              <>
                <button className="btn" onClick={onClose} disabled={importing}>
                  Cancel
                </button>
                <button
                  className="btn btn-primary"
                  onClick={handleImport}
                  disabled={importing || dataRows.length === 0 || missingRequired.length > 0}
                >
                  {importing ? 'Importing…' : `Import ${dataRows.length} row${dataRows.length === 1 ? '' : 's'}`}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
