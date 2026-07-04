// EditableCell.tsx — the inline input that runs the client validation mirror (D-04, EDIT-01/02/03).
//
// A single reusable cell for every editable value (bank qty int32, wallet GP/SC int64, skill
// level/xp). In-progress text is held in LOCAL `useState` — keystrokes are NOT routed through the
// top reducer (RESEARCH Pattern 2); only a VALID committed value dispatches upward. On each change
// it runs the caller's `validate`: on `ok` it calls `onValid(value, raw)` and clears the error; on
// failure it shows the validator's UI-SPEC error copy inline and calls `onInvalid()` — an invalid
// value CONTRIBUTES NO EDIT (D-04). The main process re-validates authoritatively, so this mirror
// is UX-only, never a trust boundary. Save-derived values render as React text/attribute values
// (auto-escaped); no raw-HTML injection API is used anywhere (T-05-09, XSS from a crafted save).

import { useState } from 'react';
import type { FieldResult } from '../lib/validation';

/** Props for the inline editable cell. */
export interface EditableCellProps {
  /** The current committed value to seed the input (int32/level/xp number, or int64 decimal string). */
  value: string | number;
  /** The field validator (validateInt32 / validateInt64 / validateLevel / validateXp). */
  validate: (raw: string) => FieldResult;
  /** Called with the parsed value + raw text when validation passes. */
  onValid: (value: string | number, raw: string) => void;
  /** Called when validation fails — the invalid value contributes no edit (D-04). */
  onInvalid: () => void;
  /** Render in the mono stack for numeric / int64 / namespaced-id fields. */
  mono?: boolean;
}

/**
 * Inline text input mirroring a single field's client-side validation. Keeps in-progress text local
 * and only propagates committed valid values upward; invalid input shows the UI-SPEC inline error.
 */
export function EditableCell({
  value,
  validate,
  onValid,
  onInvalid,
  mono,
}: EditableCellProps): React.ReactElement {
  const [text, setText] = useState<string>(String(value));
  const [error, setError] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const raw = e.target.value;
    setText(raw);
    const result = validate(raw);
    if (result.ok) {
      setError(null);
      onValid(result.value, raw);
    } else {
      setError(result.message);
      onInvalid(); // invalid contributes no edit — D-04
    }
  };

  const className = `input${mono ? ' mono' : ''}${error ? ' input--invalid' : ''}`;

  return (
    <>
      <input
        className={className}
        value={text}
        onChange={handleChange}
        aria-invalid={error != null}
        inputMode="numeric"
      />
      {error != null && <span className="inline-error">{error}</span>}
    </>
  );
}
