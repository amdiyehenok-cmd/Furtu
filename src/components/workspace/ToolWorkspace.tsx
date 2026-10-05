import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Icon } from '../Icon';
import { Controls, defaultValues } from './Controls';
import { Dropzone } from './Dropzone';
import { Results, triggerDownload, type FailedOutput, type RunResult } from './Results';

import { formatBytes, pluralize } from '@/lib/format';
import { sampleFor, textControlValuesFor, textSampleFor, type SampleBundle } from '@/lib/samples';
import { resolveFileOperation, resolveFileTextOperation, resolveInspectOperation, resolveTextOperation } from '@/lib/engines/loader';
import type { ControlValues, FileOutput, TextResult } from '@/lib/engines/types';
import type { ToolDefinition } from '@/lib/tools/types';

type Phase = 'idle' | 'running' | 'done' | 'error';

const MAX_CONCURRENCY = 3;

/**
 * The sample generator for a tool, chosen from the formats it accepts.
 *
 * Built once per tool rather than per render, and it returns a fresh set each
 * time, so pressing the button twice adds two samples rather than replacing the
 * first. A collective tool gets as many samples as it needs to be runnable.
 */
function buildSample(tool: ToolDefinition): () => Promise<SampleBundle> {
  if (!tool.input) return () => Promise.resolve({ files: [] });
  return sampleFor(tool.input.extensions, tool.minFiles ?? 1, tool.operation ?? tool.slug);
}

export function ToolWorkspace({ tool }: { tool: ToolDefinition }) {
  const [files, setFiles] = useState<File[]>([]);
  const [values, setValues] = useState<ControlValues>(() => defaultValues(tool.controls));
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState(0);
  const [progressNote, setProgressNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);
  const [textInput, setTextInput] = useState('');
  const [textResult, setTextResult] = useState<TextResult | null>(null);
  const [originalPreview, setOriginalPreview] = useState<string | null>(null);
  const [inspection, setInspection] = useState<TextResult | null>(null);
  const [inspecting, setInspecting] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const operation = tool.operation ?? tool.slug;

  // Reset when the visitor moves between tools, so state never leaks across
  // a client-side navigation.
  useEffect(() => {
    setFiles([]);
    setValues(defaultValues(tool.controls));
    setPhase('idle');
    setProgress(0);
    setError(null);
    setResult(null);
    setTextInput('');
    setTextResult(null);
    setInspection(null);
  }, [tool.slug, tool.controls]);

  // Object URLs for input previews must be revoked, or a long session leaks
  // the decoded bitmap of every image the user has ever opened.
  useEffect(() => {
    const first = files[0];
    if (!first || tool.category !== 'image') return undefined;
    const url = URL.createObjectURL(first);
    setOriginalPreview(url);
    return () => {
      URL.revokeObjectURL(url);
      setOriginalPreview(null);
    };
  }, [files, tool.category]);

  const inputBytes = useMemo(() => files.reduce((sum, file) => sum + file.size, 0), [files]);

  /**
   * Reordering, for the tools where file order is meaningful.
   *
   * Merging three documents produces a different document depending on the
   * order, so the list has to be editable. Dragging is the expected gesture but
   * it is not reachable by keyboard or on a touch screen, so every row also gets
   * explicit move-up and move-down buttons. Both routes call the same function,
   * which means they cannot disagree about what the resulting order is.
   */
  const reorderable = Boolean(tool.collects) && files.length > 1;
  const [dragging, setDragging] = useState(-1);
  const [dropTarget, setDropTarget] = useState(-1);

  const moveFile = useCallback((from: number, to: number) => {
    setFiles((current) => {
      if (from < 0 || from >= current.length || to < 0 || to >= current.length) return current;
      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }, []);

  /**
   * Read-only inspection, run as soon as a file is present.
   *
   * A tool that says it inspects a file has to actually read it, so this runs
   * before any write happens. Whatever the engine reports is merged into the
   * controls, which is what turns "edit these fields" into "here is what is
   * currently stored, correct what is wrong". It is deliberately not re-run
   * once the visitor starts typing, so a half-finished edit is never lost.
   */
  const firstFile = files[0];
  const inspectOperation = tool.inspect;

  /**
   * Control values a sample supplied, and which keys they touched.
   *
   * Held in refs rather than state because they only have to be readable by the
   * asynchronous inspection when it resolves; putting them in state would cause
   * a second inspection pass every time a value was seeded.
   */
  const sampleValues = useRef<Record<string, string | number | boolean> | null>(null);
  const seededKeys = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!firstFile || !inspectOperation) {
      setInspection(null);
      return;
    }

    const controller = new AbortController();
    let live = true;
    setInspecting(true);

    void (async () => {
      try {
        const fn = await resolveInspectOperation(tool.engine, inspectOperation);
        if (!fn || !live) return;
        const report = await fn([firstFile], {}, { signal: controller.signal, onProgress: () => {} });
        if (!live) return;
        setInspection(report);
        if (report.prefill) {
          // Explicitly seeded controls win over the inspection. A sample that
          // arrives with a correction to demonstrate must not be silently
          // reverted to what the file already contained, and the inspection
          // resolves asynchronously, so the rule has to be explicit rather than
          // left to whichever write happens to land last.
          setValues((current) => {
            const next = { ...current, ...report.prefill };
            for (const key of seededKeys.current) {
              if (key in (sampleValues.current ?? {})) next[key] = sampleValues.current![key];
            }
            return next;
          });
        }
      } catch {
        // An unreadable file is reported by the run step, which can explain it.
        // A failed inspection must not block the tool from being used.
        if (live) setInspection(null);
      } finally {
        if (live) setInspecting(false);
      }
    })();

    return () => {
      live = false;
      controller.abort();
    };
  }, [firstFile, inspectOperation, tool.engine]);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    sampleValues.current = null;
    seededKeys.current = new Set();
    setFiles([]);
    setResult(null);
    setTextResult(null);
    setInspection(null);
    setError(null);
    setProgress(0);
    setPhase('idle');
  }, []);

  const runFiles = useCallback(async () => {
    if (files.length === 0) return;

    const controller = new AbortController();
    abortRef.current = controller;
    setPhase('running');
    setProgress(0);
    setError(null);
    setResult(null);
    const startedAt = performance.now();

    // Shared by the collective and per-file paths so a merged document and a
    // batch of twenty images report their results in exactly the same way.
    const finishRun = (outputs: FileOutput[], failures: FailedOutput[], started: number) => {
      const outputBytes = outputs.reduce((sum, output) => sum + output.blob.size, 0);
      setResult({
        outputs,
        failures,
        inputBytes: inputBytes || files.reduce((sum, file) => sum + file.size, 0),
        outputBytes,
        elapsedMs: performance.now() - started,
      });
      setPhase(outputs.length > 0 ? 'done' : 'error');
      if (outputs.length === 0 && failures.length > 0) setError(failures[0].message);
    };

    try {
      // A few file-input tools produce text rather than a download — extracting
      // a PDF's text layer, for example. If the engine provides one, the rich
      // text result is used instead of the file list.
      const textOperation = await resolveFileTextOperation(tool.engine, operation);
      if (textOperation) {
        const produced = await textOperation(files, values, {
          signal: controller.signal,
          onProgress: setProgress,
        });
        setTextResult(produced);
        setResult(null);
        setPhase('done');
        return;
      }

      const operationFn = await resolveFileOperation(tool.engine, operation);
      if (!operationFn) {
        throw new Error('This tool is not available right now. Please reload the page and try again.');
      }

      const outputs: FileOutput[] = [];
      const failures: FailedOutput[] = [];

      // A collective operation needs every selected file in one call — merging
      // two documents is the obvious case. Running it through the per-file pool
      // below would hand it a single file and it would correctly refuse, which
      // is the one failure mode that looks like a broken tool rather than a
      // broken file.
      const required = tool.minFiles ?? 1;
      if (files.length < required) {
        setError(
          required === 2
            ? 'Add at least two files. This tool works by combining them.'
            : `Add at least ${required} files to continue.`,
        );
        setPhase('error');
        return;
      }

      if (tool.collects) {
        try {
          const produced = await operationFn(files, values, {
            signal: controller.signal,
            onProgress: (fraction, note) => {
              if (note) setProgressNote(note);
              setProgress(fraction);
            },
          });
          outputs.push(...produced);
        } catch (caught) {
          setError(messageFor(caught));
          setPhase('error');
          return;
        }

        if (controller.signal.aborted) {
          setPhase('idle');
          return;
        }

        finishRun(outputs, failures, startedAt);
        return;
      }

      // Bounded concurrency: browsers give a handful of cores to a tab, and
      // decoding twenty images at once reliably triggers a tab crash.
      const queue = [...files];
      let done = 0;

      const worker = async () => {
        for (;;) {
          const file = queue.shift();
          if (!file) return;
          try {
            const produced = await operationFn([file], values, {
              signal: controller.signal,
              onProgress: (fraction, note) => {
                setProgressNote(note ?? `Processing ${file.name}`);
                void fraction;
              },
            });
            outputs.push(...produced);
          } catch (caught) {
            failures.push({ name: file.name, message: messageFor(caught) });
          }
          done += 1;
          setProgress(done / files.length);
        }
      };

      await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENCY, files.length) }, worker));

      if (controller.signal.aborted) {
        setPhase('idle');
        return;
      }

      finishRun(outputs, failures, startedAt);
    } catch (caught) {
      setError(messageFor(caught));
      setPhase('error');
    } finally {
      abortRef.current = null;
    }
  }, [files, inputBytes, operation, tool.engine, values]);

  const runText = useCallback(async () => {
    const controller = new AbortController();
    abortRef.current = controller;
    setPhase('running');
    setError(null);

    try {
      const operationFn = await resolveTextOperation(tool.engine, operation);
      if (!operationFn) {
        throw new Error('This tool is not available right now. Please reload the page and try again.');
      }
      const produced = await operationFn(textInput, values, {
        signal: controller.signal,
        onProgress: (fraction, note) => {
          setProgress(fraction);
          if (note) setProgressNote(note);
        },
      });
      setTextResult(produced);
      setPhase('done');
    } catch (caught) {
      setError(messageFor(caught));
      setPhase('error');
    } finally {
      abortRef.current = null;
    }
  }, [operation, textInput, tool.engine, values]);

  const cancel = () => {
    abortRef.current?.abort();
    setPhase('idle');
    setProgress(0);
    setProgressNote('');
  };

  // A collective tool is not runnable until it has enough files to work with,
  // so the button reflects that rather than letting the visitor press it and be
  // told the same thing afterwards.
  const minFiles = tool.minFiles ?? 1;
  const canRun =
    tool.workspace === 'files' ? files.length >= minFiles : textInput.trim().length > 0;
  const busy = phase === 'running';
  const shortBy = tool.workspace === 'files' ? minFiles - files.length : 0;

  return (
    <div className="ws">
      <div className="ws-topbar">
        <div className="ws-crumbs">
          <span>{tool.category.toUpperCase()}</span>
          <Icon name="chevron" size={13} />
          <strong>{tool.name}</strong>
        </div>
        <span className="private-badge">
          <Icon name="lock" size={13} />
          Processed locally
        </span>
      </div>

      <div className="ws-body">
        {tool.workspace === 'files' && tool.input && (
          <>
            <Dropzone
              input={tool.input}
              limits={tool.limits}
              files={files}
              onFiles={setFiles}
              onSample={buildSample(tool)}
              onSampleValues={(seed) => {
                sampleValues.current = seed;
                seededKeys.current = new Set(Object.keys(seed));
                setValues((current) => ({ ...current, ...seed }));
              }}
              disabled={busy || phase === 'done'}
            />

            {files.length > 0 && phase !== 'done' && (
              <>
                <ul className="file-queue" aria-label="Selected files, in processing order">
                  {files.map((file, index) => (
                    <li
                      className={`file-row${dragging === index ? ' is-dragging' : ''}${
                        dropTarget === index ? ' is-drop-target' : ''
                      }`}
                      key={`${file.name}-${index}-${file.size}`}
                      draggable={reorderable}
                      onDragStart={
                        reorderable
                          ? (event) => {
                              event.dataTransfer.effectAllowed = 'move';
                              // Firefox refuses to start a drag unless some data
                              // is set, even for a purely visual reorder.
                              event.dataTransfer.setData('text/plain', file.name);
                              setDragging(index);
                            }
                          : undefined
                      }
                      onDragOver={
                        reorderable
                          ? (event) => {
                              event.preventDefault();
                              event.dataTransfer.dropEffect = 'move';
                              if (dropTarget !== index) setDropTarget(index);
                            }
                          : undefined
                      }
                      onDragLeave={
                        reorderable
                          ? () => setDropTarget((current) => (current === index ? -1 : current))
                          : undefined
                      }
                      onDrop={
                        reorderable
                          ? (event) => {
                              event.preventDefault();
                              if (dragging >= 0 && dragging !== index) moveFile(dragging, index);
                              setDragging(-1);
                              setDropTarget(-1);
                            }
                          : undefined
                      }
                      onDragEnd={
                        reorderable
                          ? () => {
                              setDragging(-1);
                              setDropTarget(-1);
                            }
                          : undefined
                      }
                    >
                      {reorderable && (
                        <span className="file-grip" aria-hidden="true">
                          <Icon name="menu" size={15} />
                        </span>
                      )}
                      <span className="file-thumb">
                        <Icon name="file" size={16} />
                      </span>
                      <div>
                        <span className="file-name">{file.name}</span>
                        <span className="file-meta">
                          {reorderable ? `${index + 1}. ` : ''}
                          {formatBytes(file.size)}
                          {file.type ? ` · ${file.type}` : ''}
                        </span>
                      </div>
                      {reorderable && (
                        <span className="file-move">
                          <button
                            type="button"
                            aria-label={`Move ${file.name} up`}
                            disabled={busy || index === 0}
                            onClick={() => moveFile(index, index - 1)}
                          >
                            <Icon name="chevron" size={14} />
                          </button>
                          <button
                            type="button"
                            aria-label={`Move ${file.name} down`}
                            disabled={busy || index === files.length - 1}
                            onClick={() => moveFile(index, index + 1)}
                          >
                            <Icon name="chevron" size={14} />
                          </button>
                        </span>
                      )}
                      <button
                        type="button"
                        className="file-remove"
                        aria-label={`Remove ${file.name}`}
                        disabled={busy}
                        onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}
                      >
                        <Icon name="x" size={15} />
                      </button>
                    </li>
                  ))}
                </ul>
                <p className="queue-summary">
                  <span>{pluralize(files.length, 'file')} selected</span>
                  <span className="queue-total">{formatBytes(inputBytes)}</span>
                </p>
                {reorderable && (
                  <p className="queue-hint">
                    <Icon name="layers" size={13} />
                    Drag a row, or use its arrows, to change the order. Files are combined in the order shown.
                  </p>
                )}
              </>
            )}
          </>
        )}

        {/*
          The inspection report, shown before the controls and before anything is
          written, so the visitor can see what the file actually contains and
          correct it in the fields below.
        */}
        {files.length > 0 && tool.inspect && phase !== 'done' && (
          <section className="ws-inspect" aria-live="polite" aria-busy={inspecting}>
            <div className="ws-inspect-head">
              <Icon name="search" size={14} />
              <strong>What this file contains</strong>
              {inspecting && <span className="ws-inspect-note">Reading…</span>}
            </div>

            {inspection?.meta && inspection.meta.length > 0 && (
              <div className="text-stat-row" style={{ marginTop: 10 }}>
                {inspection.meta.map((item) => (
                  <span className="stat-chip" key={item.label}>
                    <b>{item.value}</b>
                    <span>{item.label}</span>
                  </span>
                ))}
              </div>
            )}

            {inspection?.diagnostics && inspection.diagnostics.length > 0 && (
              <ul className="diagnostics">
                {inspection.diagnostics.map((item, index) => (
                  <li key={`${item.level}-${index}`}>
                    <span className={item.level}>
                      <Icon name={item.level === 'ok' ? 'check' : item.level === 'warn' ? 'x' : 'x'} size={13} />
                    </span>
                    <span>{item.message}</span>
                  </li>
                ))}
              </ul>
            )}

            {inspection && !inspecting && (
              <p className="ws-inspect-note">Loaded into the fields below. Edit what is wrong, then run the tool.</p>
            )}
          </section>
        )}

        {tool.workspace === 'text' && (
          <div className="text-ws">
            <div className="text-io">
              <div>
                <span className="text-io-label" id="text-input-label">
                  Input
                  <span className="io-actions">
                    <button
                      type="button"
                      className="io-btn"
                      onClick={() => {
                        setTextInput(textSampleFor(operation));
                        // Some text tools refuse to run without a control, not just
                        // without text — a pattern tester with no pattern is a correct
                        // refusal and a useless demo. Seed those alongside the box.
                        setValues((current) => ({ ...current, ...textControlValuesFor(operation) }));
                      }}
                      disabled={false}
                      title="Fill the box with a sample so you can see the tool work"
                    >
                      Try a sample
                    </button>
                    <button
                      type="button"
                      className="io-btn"
                      onClick={() => setTextInput('')}
                      disabled={textInput.length === 0}
                    >
                      Clear
                    </button>
                    {tool.input?.multiple === false && tool.input.extensions.length > 0 && (
                      <span className="io-btn" aria-hidden="true">
                        {tool.input.extensions.join(' ')}
                      </span>
                    )}
                  </span>
                </span>
                <textarea
                  value={textInput}
                  onChange={(event) => setTextInput(event.target.value)}
                  placeholder={placeholderFor(tool)}
                  aria-labelledby="text-input-label"
                  spellCheck={false}
                  autoCapitalize="off"
                  autoCorrect="off"
                />
              </div>
              <div>
                <span className="text-io-label" id="text-output-label">
                  Output
                  {textResult?.download && (
                    <span className="io-actions">
                      <button
                        type="button"
                        className="io-btn"
                        onClick={() => triggerDownload(textResult.download!.blob, textResult.download!.name)}
                      >
                        Download
                      </button>
                    </span>
                  )}
                </span>
                <textarea
                  className="text-out"
                  value={textResult?.output ?? ''}
                  readOnly
                  aria-labelledby="text-output-label"
                  placeholder="The result appears here."
                  spellCheck={false}
                />
              </div>
            </div>

            {textResult && (textResult.meta?.length || textResult.diagnostics?.length) && (
              <>
                {textResult.meta && textResult.meta.length > 0 && (
                  <div className="text-stat-row" style={{ marginTop: 12 }}>
                    {textResult.meta.map((item) => (
                      <span className="stat-chip" key={item.label}>
                        <b>{item.value}</b>
                        <span>{item.label}</span>
                      </span>
                    ))}
                  </div>
                )}
                {textResult.diagnostics && textResult.diagnostics.length > 0 && (
                  <ul className="diagnostics" role="status">
                    {textResult.diagnostics.map((item, index) => (
                      <li key={`${item.level}-${index}`}>
                        <span className={item.level}>
                          <Icon name={item.level === 'ok' ? 'check' : item.level === 'warn' ? 'x' : 'x'} size={13} />
                        </span>
                        <span>{item.message}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        )}

        <Controls
          controls={tool.controls}
          values={values}
          onChange={(id, value) => setValues((current) => ({ ...current, [id]: value }))}
        />

        {result && phase === 'done' && (
          <Results
            result={result}
            originalPreviewUrl={originalPreview}
            originalName={files[0]?.name}
            onReset={reset}
          />
        )}

        {/* File tools whose output is text, e.g. extracting a PDF's text layer. */}
        {tool.workspace === 'files' && textResult && phase === 'done' && (
          <div className="text-ws" style={{ marginTop: 18 }}>
            <span className="text-io-label" id="file-text-label">
              Extracted text
              <span className="io-actions">
                {textResult.output && (
                  <button
                    type="button"
                    className="io-btn"
                    onClick={() => navigator.clipboard?.writeText(textResult.output)}
                  >
                    Copy
                  </button>
                )}
                {textResult.download && (
                  <button
                    type="button"
                    className="io-btn"
                    onClick={() => triggerDownload(textResult.download!.blob, textResult.download!.name)}
                  >
                    Download
                  </button>
                )}
              </span>
            </span>
            <textarea
              className="text-out"
              value={textResult.output}
              readOnly
              aria-labelledby="file-text-label"
              placeholder="No text was found in this document."
              spellCheck={false}
            />
            {textResult.meta && textResult.meta.length > 0 && (
              <div className="text-stat-row" style={{ marginTop: 12 }}>
                {textResult.meta.map((item) => (
                  <span className="stat-chip" key={item.label}>
                    <b>{item.value}</b>
                    <span>{item.label}</span>
                  </span>
                ))}
              </div>
            )}
            {textResult.diagnostics && textResult.diagnostics.length > 0 && (
              <ul className="diagnostics" role="status">
                {textResult.diagnostics.map((item, index) => (
                  <li key={`${item.level}-${index}`}>
                    <span className={item.level}>
                      <Icon name={item.level === 'ok' ? 'check' : 'x'} size={13} />
                    </span>
                    <span>{item.message}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="ws-actions">
              <button type="button" className="button secondary compact" onClick={reset}>
                Start again
              </button>
            </div>
          </div>
        )}
      </div>

      {tool.workspace === 'files' && phase !== 'done' && (
        <div className="ws-actions">
          <button
            type="button"
            className="button primary"
            disabled={!canRun || busy}
            onClick={() => void runFiles()}
          >
            {busy ? <span className="spinner" aria-hidden="true" /> : <Icon name="spark" size={17} />}
            {busy ? 'Processing' : 'Process files'}
          </button>
          {busy ? (
            <button type="button" className="button secondary compact" onClick={cancel}>
              Cancel
            </button>
          ) : (
            files.length > 0 && (
              <button type="button" className="button secondary compact" onClick={reset}>
                Clear
              </button>
            )
          )}
          {/*
            A collective tool explains its own requirement, because a disabled
            button with no reason reads as a broken page.
          */}
          {shortBy > 0 && (
            <span className="ws-actions-hint" role="status">
              Add {pluralize(shortBy, 'more file')} to continue.
            </span>
          )}
          {/*
            The privacy reassurance is never displaced. It stays the last thing
            on the bar whatever else is happening, because the claim that
            nothing is uploaded is the one thing that must always be on screen.
          */}
          <span className="ws-actions-note">Files stay on this device. Nothing is uploaded.</span>
        </div>
      )}

      {tool.workspace === 'text' && (
        <div className="ws-actions">
          <button
            type="button"
            className="button primary"
            disabled={!canRun || busy}
            onClick={() => void runText()}
          >
            {busy ? <span className="spinner" aria-hidden="true" /> : <Icon name="spark" size={17} />}
            {busy ? 'Working' : `Run ${tool.name}`}
          </button>
          {textResult && (
            <button
              type="button"
              className="button secondary compact"
              onClick={() => navigator.clipboard?.writeText(textResult.output)}
            >
              Copy output
            </button>
          )}
          <span className="ws-actions-note">Your text never leaves this page.</span>
        </div>
      )}

      {busy && progress > 0 && (
        <div className="ws-status">
          <div className="progress" style={{ flex: 1 }}>
            <div className="progress-bar" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
          <span style={{ minWidth: 160, textAlign: 'right' }}>{progressNote || 'Working…'}</span>
        </div>
      )}

      {error && phase === 'error' && (
        <div className="ws-status is-error" role="alert">
          <Icon name="x" size={15} />
          <span>{error}</span>
          <button type="button" className="io-btn" style={{ marginLeft: 'auto' }} onClick={reset}>
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}

/** Turns any thrown value into something worth showing a non-technical person. */
export function messageFor(caught: unknown): string {
  if (caught instanceof Error && caught.message) return caught.message;
  if (typeof caught === 'string' && caught.trim()) return caught;
  return 'Something went wrong while processing. Please try again with a different file.';
}

function placeholderFor(tool: ToolDefinition): string {
  switch (tool.slug) {
    case 'json-formatter':
      return '{\n  "name": "Furtu",\n  "private": true\n}';
    case 'json-validator':
      return 'Paste JSON to check whether it is valid.';
    case 'base64-encoder':
      return 'Text to encode…';
    case 'base64-decoder':
      return 'SGVsbG8sIHRoaXMgZWNvZGVkLg==';
    case 'url-encoder':
      return 'Text or a URL to encode…';
    case 'url-decoder':
      return 'Hello%20World';
    case 'jwt-decoder':
      return 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0In0.signature';
    case 'regex-tester':
      return 'Sample text to test your pattern against.';
    case 'color-converter':
      return '#1E3A8A';
    case 'timestamp-converter':
      return '2026-01-30T09:15:00Z';
    default:
      return `Paste or type the input for ${tool.name}…`;
  }
}
