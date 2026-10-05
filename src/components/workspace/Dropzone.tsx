import { useCallback, useRef, useState } from 'react';

import { Icon } from '../Icon';
import { formatBytes } from '@/lib/format';
import type { InputSpec, Limits } from '@/lib/tools/types';
import type { SampleBundle } from '@/lib/samples';
import { validateFiles, type ValidationIssue } from '@/lib/validate';

interface DropzoneProps {
  input: InputSpec;
  limits: Limits;
  files: File[];
  onFiles: (files: File[]) => void;
  /** Control values seeded alongside a sample, so the tool is runnable at once. */
  onSampleValues?: (values: Record<string, string | number | boolean>) => void;
  /**
   * Produces a sample, which may also seed control values — a page-range tool
   * is not runnable from a file alone.
   */
  onSample: () => Promise<SampleBundle>;
  disabled?: boolean;
}

/**
 * File intake.
 *
 * Drag and drop is a convenience, never the only route: the zone is a real
 * button, the input is keyboard-reachable, and `paste` is wired up for the
 * tools that take a single file. Every file is validated on three axes before
 * it is accepted, and rejections are shown rather than silently dropped.
 */
export function Dropzone({ input, limits, files, onFiles, onSample, onSampleValues, disabled }: DropzoneProps) {
  const [over, setOver] = useState(false);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [sampling, setSampling] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

  /** Applies a validated file set through the same path a real upload takes. */
  const accept = useCallback(
    async (incoming: File[]) => {
      if (incoming.length === 0) return;
      const result = await validateFiles(incoming, input, limits);
      setIssues(result.rejected);
      if (result.accepted.length > 0) {
        onFiles(input.multiple ? [...files, ...result.accepted] : result.accepted.slice(0, 1));
      }
    },
    [files, input, limits, onFiles],
  );

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      dragDepth.current = 0;
      setOver(false);
      if (disabled) return;
      void accept(Array.from(event.dataTransfer.files));
    },
    // `accept` closes over `files`, so it is intentionally in the deps.
    [disabled, files, input, limits],
  );

  return (
    <div>
      <div
        className={`dropzone${over ? ' is-over' : ''}${disabled ? ' is-disabled' : ''}`}
        role="button"
        tabIndex={0}
        aria-disabled={disabled}
        aria-label={`Add ${input.extensions.join(' or ')} files`}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(event) => {
          if (disabled) return;
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
        onPaste={(event) => {
          if (disabled) return;
          const pasted = Array.from(event.clipboardData?.files ?? []);
          if (pasted.length > 0) {
            event.preventDefault();
            void accept(pasted);
          }
        }}
        onDragEnter={(event) => {
          event.preventDefault();
          dragDepth.current += 1;
          if (!disabled) setOver(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          // Drag events fire for every child element, so count depth rather than
          // toggling, otherwise the highlight flickers on the way out.
          dragDepth.current -= 1;
          if (dragDepth.current <= 0) {
            dragDepth.current = 0;
            setOver(false);
          }
        }}
        onDrop={onDrop}
      >
        <span className="upload-icon">
          <Icon name="upload" size={24} />
        </span>
        <strong>Drop your {files.length > 0 ? 'next ' : ''}{input.extensions[0].replace('.', '').toUpperCase()} files here</strong>
        <small>or choose files from your device</small>
        <span className="button primary compact" aria-hidden="true">
          Choose files
        </span>
        <span>
          {input.extensions.join(' · ')} · up to {formatBytes(input.maxBytes, 0)} per file ·{' '}
          {input.multiple ? `up to ${limits.maxFiles} files` : 'one file'}
        </span>

        {/*
          "No file to hand?" is the single biggest reason a tool page cannot be
          judged. The sample is built in the page rather than downloaded, which
          keeps the no-upload claim literally true and costs nothing until it is
          pressed. It goes through the same three-axis validation as a real
          upload, so it proves the tool works rather than bypassing the checks.
        */}
        <span className="dropzone-sample">
          <button
            type="button"
            className="link-button"
            disabled={disabled || sampling}
            onClick={async (event) => {
              event.stopPropagation();
              setSampling(true);
              try {
                const bundle = await onSample();
                // Controls first, so the file arrives into an already-usable
                // form rather than one that needs a second interaction.
                if (bundle.values) onSampleValues?.(bundle.values);
                await accept(bundle.files);
              } catch (error) {
                setIssues([
                  {
                    fileName: 'Sample file',
                    reason: 'empty',
                    message:
                      error instanceof Error
                        ? `The sample could not be created: ${error.message}`
                        : 'The sample could not be created in this browser.',
                  },
                ]);
              } finally {
                setSampling(false);
              }
            }}
          >
            {sampling ? 'Creating…' : 'No file to hand? Try a sample'}
          </button>
          <small>Generated in your browser. Nothing is downloaded.</small>
        </span>

        <input
          ref={inputRef}
          type="file"
          className="visually-hidden"
          accept={input.accept}
          multiple={input.multiple}
          onChange={(event) => {
            void accept(Array.from(event.target.files ?? []));
            // Reset so choosing the same file twice still fires a change event.
            event.target.value = '';
          }}
        />
      </div>

      {issues.length > 0 && (
        <ul className="diagnostics" role="alert">
          {issues.map((issue, index) => (
            <li key={`${issue.fileName}-${index}`}>
              <span className={issue.reason === 'empty' ? 'warn' : 'error'}>
                <Icon name="x" size={13} />
              </span>
              <span>
                <strong>{issue.fileName}</strong> — {issue.message}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
