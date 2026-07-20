import { useState } from 'react';
import { useDatabase } from '../context/DatabaseContext';
import { importFromText, type ImportReport } from '../import/importer';
import { promptTemplate, importSchemaText } from '../import/promptTemplate';

export function ImportPage() {
  const db = useDatabase();
  const [report, setReport] = useState<ImportReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showSchema, setShowSchema] = useState(false);

  const handleFile = async (file: File) => {
    setError(null);
    setReport(null);
    setBusy(true);
    try {
      const text = await file.text();
      const r = await importFromText(db, text);
      setReport(r);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* clipboard may be blocked; user can select manually */
    }
  };

  return (
    <div>
      <div className="card">
        <h2>Import data</h2>
        <p className="muted">
          Paste free-form notes into any AI agent with the prompt below, get JSON back, and upload it.
          The app validates each collection and upserts — re-importing the same ids updates them.
        </p>
        <div className="row wrap">
          <button onClick={() => copy(promptTemplate())}>Copy prompt template</button>
          <button onClick={() => setShowSchema((s) => !s)}>{showSchema ? 'Hide' : 'Show'} JSON schema</button>
        </div>
        {showSchema && <pre className="code">{importSchemaText()}</pre>}
      </div>

      <div className="card">
        <h2>Upload JSON</h2>
        <input
          type="file"
          accept="application/json,.json"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
        {busy && <p className="muted">Validating and importing…</p>}
        {error && <div className="notice warn" style={{ marginTop: 10 }}>{error}</div>}
      </div>

      {report && (
        <div className="card">
          <h2>Result</h2>
          <div className={`notice ${report.totalErrors === 0 ? 'ok' : 'warn'}`}>
            Imported {report.totalInserted} documents · {report.totalErrors} errors
          </div>
          <table>
            <thead>
              <tr>
                <th>Collection</th>
                <th>Inserted</th>
                <th>Errors</th>
              </tr>
            </thead>
            <tbody>
              {report.collections.map((c) => (
                <tr key={c.collection}>
                  <td>{c.collection}</td>
                  <td>{c.inserted}</td>
                  <td>{c.errors.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {report.collections.some((c) => c.errors.length > 0) && (
            <>
              <h3>Error detail</h3>
              <pre className="code">
                {report.collections
                  .filter((c) => c.errors.length)
                  .map((c) =>
                    c.errors
                      .map((e) => `${c.collection}[${e.index}]${e.id ? ` (${e.id})` : ''}: ${e.errors.join(', ')}`)
                      .join('\n'),
                  )
                  .join('\n')}
              </pre>
            </>
          )}
        </div>
      )}
    </div>
  );
}
