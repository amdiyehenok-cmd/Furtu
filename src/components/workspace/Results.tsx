import { zipSync } from 'fflate';

import { Icon } from '../Icon';
import { formatBytes, formatSavings } from '@/lib/format';
import type { FileOutput } from '@/lib/engines/types';

export interface FailedOutput {
  name: string;
  message: string;
}

export interface RunResult {
  outputs: FileOutput[];
  failures: FailedOutput[];
  /** Sum of input bytes, used for the overall savings figure. */
  inputBytes: number;
  outputBytes: number;
  elapsedMs: number;
}

export function triggerDownload(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Give the browser a tick to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Zips results for one-click download when a run produced more than one file. */
export async function downloadAsZip(outputs: FileOutput[], zipName: string) {
  // Synchronous zipping because fflate is ~8 KB. An async import here would
  // add a round trip to the one moment the user is waiting for a download.
  const entries: Record<string, Uint8Array> = {};
  for (const output of outputs) {
    const buffer = await output.blob.arrayBuffer();
    entries[output.name] = new Uint8Array(buffer);
  }
  const zipped = zipSync(entries, { level: 6 });
  triggerDownload(new Blob([zipped], { type: 'application/zip' }), zipName);
}

interface ResultsProps {
  result: RunResult;
  /** Object URL of the first input, for the before/after comparison. */
  originalPreviewUrl?: string | null;
  originalName?: string;
  onReset: () => void;
}

export function Results({ result, originalPreviewUrl, originalName, onReset }: ResultsProps) {
  const firstPreview = result.outputs.find((output) => output.previewUrl)?.previewUrl;
  const showCompare = Boolean(originalPreviewUrl) && Boolean(firstPreview);

  const savings =
    result.inputBytes > 0 && result.outputBytes > 0 && result.outputBytes < result.inputBytes
      ? formatSavings(result.inputBytes, result.outputBytes)
      : null;

  const fileCount = result.outputs.length + result.failures.length;

  return (
    <div className="results" aria-live="polite">
      <div className="results-head">
        <strong>
          {fileCount} {fileCount === 1 ? 'file' : 'files'} ready
        </strong>
        {savings && <span className="savings">{savings}</span>}
        <span className="queue-total">
          {formatBytes(result.inputBytes)} → {formatBytes(result.outputBytes)} ·{' '}
          {(result.elapsedMs / 1000).toFixed(1)}s
        </span>
      </div>

      <ul className="result-list">
        {result.outputs.map((output) => (
          <li className="result-row" key={output.name}>
            {output.previewUrl ? (
              <span className="result-thumb">
                <img src={output.previewUrl} alt="" loading="lazy" />
              </span>
            ) : (
              <span className="result-thumb">
                <Icon name="file" size={17} />
              </span>
            )}
            <div>
              <span className="result-name">{output.name}</span>
              <span className="result-meta">
                {output.note ? `${output.note} · ` : ''}
                {formatBytes(output.blob.size)}
              </span>
            </div>
            <button
              type="button"
              className="button secondary compact"
              onClick={() => triggerDownload(output.blob, output.name)}
            >
              <Icon name="download" size={15} />
              Download
            </button>
          </li>
        ))}

        {result.failures.map((failure) => (
          <li className="result-row is-failed" key={`fail-${failure.name}`}>
            <span className="result-thumb">
              <Icon name="x" size={16} />
            </span>
            <div>
              <span className="result-name">{failure.name}</span>
              <span className="result-error">{failure.message}</span>
            </div>
          </li>
        ))}
      </ul>

      {showCompare && (
        <div className="compare">
          <div className="compare-grid">
            <div className="compare-cell">
              <span>Before{originalName ? ` · ${originalName}` : ''}</span>
              <img src={originalPreviewUrl ?? ''} alt="The file as you uploaded it" />
            </div>
            <div className="compare-cell">
              <span>After{result.outputs[0]?.note ? ` · ${result.outputs[0].note}` : ''}</span>
              <img src={firstPreview ?? ''} alt="The processed result" />
            </div>
          </div>
        </div>
      )}

      <div className="ws-actions">
        {result.outputs.length > 1 && (
          <button
            type="button"
            className="button primary compact"
            onClick={() => void downloadAsZip(result.outputs, 'furtu-results.zip')}
          >
            <Icon name="zip" size={15} />
            Download all as ZIP
          </button>
        )}
        <button type="button" className="button secondary compact" onClick={onReset}>
          Start again
        </button>
      </div>
    </div>
  );
}
