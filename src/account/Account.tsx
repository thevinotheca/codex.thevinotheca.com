import { useState, type ChangeEvent } from 'react'
import { Link } from 'react-router'
import { entryStore } from '../entries/index.ts'
import { exportFile, exportFileName, importEntries, parseExport, type ImportResult } from './transfer.ts'

// Account: export and import of the whole record. The account half arrives
// with accounts and is not drawn here. Import writes what is new and skips
// every identifier the store already holds, deleted ones included.

function Account() {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ImportResult>()
  const [error, setError] = useState<string>()

  async function exportRecord() {
    if (busy) return
    setBusy(true)
    setError(undefined)
    try {
      const url = URL.createObjectURL(await exportFile(entryStore))
      const a = document.createElement('a')
      a.href = url
      a.download = exportFileName()
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function importRecord(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget
    const file = input.files?.[0]
    input.value = ''
    if (!file || busy) return
    setBusy(true)
    setError(undefined)
    setResult(undefined)
    try {
      setResult(await importEntries(entryStore, parseExport(await file.text())))
    } catch (e) {
      setError(e instanceof SyntaxError ? 'The file could not be read.' : e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="screen">
      <header className="screen-header">
        <Link className="back" to="/">‹ The Book</Link>
        <h1 className="screen-title">Account</h1>
      </header>

      {result && (
        <dl className="transfer-result" aria-live="polite">
          <div className="transfer-count">
            <dt>Written</dt>
            <dd>{result.written}</dd>
          </div>
          <div className="transfer-count">
            <dt>Skipped, already held</dt>
            <dd>{result.skipped}</dd>
          </div>
          {result.refused > 0 && (
            <div className="transfer-count">
              <dt>Refused</dt>
              <dd>{result.refused}</dd>
            </div>
          )}
        </dl>
      )}

      <nav className="screen-actions">
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="action-pair">
          <label className={`action action-quiet${busy ? ' action-busy' : ''}`}>
            Import
            <input
              className="transfer-file"
              type="file"
              accept=".json,application/json"
              onChange={importRecord}
              disabled={busy}
            />
          </label>
          <button className="action" type="button" onClick={exportRecord} disabled={busy}>
            Export
          </button>
        </div>
      </nav>
    </main>
  )
}

export default Account
