import type { ControlSpec } from '@/lib/tools/types';
import type { ControlValues } from '@/lib/engines/types';

export function defaultValues(controls: ControlSpec[]): ControlValues {
  const values: ControlValues = {};
  for (const control of controls) {
    // The page-range control has no `default`: an empty range means "every
    // page", which is expressed by the key being present and blank.
    if ('default' in control) {
      const fallback = control.default;
      if (fallback !== undefined) values[control.id] = fallback;
    } else {
      values[control.id] = '';
    }
  }
  return values;
}

interface ControlsProps {
  controls: ControlSpec[];
  values: ControlValues;
  onChange: (id: string, value: string | number | boolean) => void;
  /** Page count is needed to bound the page-range inputs. */
  pageCount?: number | null;
}

/**
 * Renders a tool's options from its declarative `ControlSpec`.
 *
 * This is what keeps the tool catalogue cheap: a new tool declares its options
 * as data and gets a complete, labelled, accessible form for free, instead of
 * shipping bespoke JSX per tool.
 */
export function Controls({ controls, values, onChange, pageCount }: ControlsProps) {
  if (controls.length === 0) return null;

  return (
    <div className="controls">
      {controls.map((control) => {
        const id = `control-${control.id}`;
        const value = values[control.id];

        switch (control.kind) {
          case 'select':
            return (
              <div className="control" key={control.id}>
                <label htmlFor={id}>{control.label}</label>
                <select
                  id={id}
                  value={String(value ?? control.default)}
                  onChange={(event) => onChange(control.id, event.target.value)}
                >
                  {control.options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {control.help && <p className="control-help">{control.help}</p>}
              </div>
            );

          case 'number':
            return (
              <div className="control" key={control.id}>
                <label htmlFor={id}>{control.label}</label>
                <div className="control-inline">
                  <input
                    id={id}
                    type="number"
                    inputMode="numeric"
                    min={control.min}
                    max={control.max}
                    step={control.step}
                    value={Number(value ?? control.default)}
                    onChange={(event) => onChange(control.id, Number(event.target.value))}
                  />
                  {control.suffix && <span className="control-suffix">{control.suffix}</span>}
                </div>
                {control.help && <p className="control-help">{control.help}</p>}
              </div>
            );

          case 'toggle':
            return (
              <div className="control" key={control.id}>
                <label className="toggle" htmlFor={id}>
                  <input
                    id={id}
                    type="checkbox"
                    checked={Boolean(value ?? control.default)}
                    onChange={(event) => onChange(control.id, event.target.checked)}
                  />
                  <span className="toggle-track" aria-hidden="true">
                    <span className="toggle-thumb" />
                  </span>
                  <span>{control.label}</span>
                </label>
                {control.help && <p className="control-help">{control.help}</p>}
              </div>
            );

          case 'text':
            return (
              <div className="control" key={control.id}>
                <label htmlFor={id}>{control.label}</label>
                <input
                  id={id}
                  type="text"
                  value={String(value ?? control.default ?? '')}
                  placeholder={control.placeholder}
                  maxLength={control.maxLength}
                  onChange={(event) => onChange(control.id, event.target.value)}
                />
                {control.help && <p className="control-help">{control.help}</p>}
              </div>
            );

          case 'color':
            return (
              <div className="control" key={control.id}>
                <label htmlFor={id}>{control.label}</label>
                <div className="control-inline">
                  <input
                    id={id}
                    type="color"
                    value={String(value ?? control.default)}
                    onChange={(event) => onChange(control.id, event.target.value)}
                  />
                  <span className="control-suffix">{String(value ?? control.default)}</span>
                </div>
                {control.help && <p className="control-help">{control.help}</p>}
              </div>
            );

          case 'pages':
            return (
              <div className="control" key={control.id}>
                <label htmlFor={id}>{control.label}</label>
                <div className="page-range">
                  <input
                    id={id}
                    type="text"
                    inputMode="numeric"
                    placeholder="1-3, 7, 12-"
                    value={String(value ?? '')}
                    onChange={(event) => onChange(control.id, event.target.value)}
                    aria-describedby={`${id}-help`}
                  />
                  {pageCount ? (
                    <button
                      type="button"
                      className="io-btn"
                      onClick={() => onChange(control.id, `1-${pageCount}`)}
                    >
                      All {pageCount}
                    </button>
                  ) : null}
                </div>
                {control.help && (
                  <p className="control-help" id={`${id}-help`}>
                    {control.help}
                  </p>
                )}
              </div>
            );

          default:
            return null;
        }
      })}
    </div>
  );
}
