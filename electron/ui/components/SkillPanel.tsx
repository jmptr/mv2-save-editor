// SkillPanel.tsx — the skill browse + filter + level-or-XP inline edit panel (BROWSE-03/05, EDIT-03, D-03).
//
// Lists every skill virtualized (BROWSE-03), filters as-you-type by skill id (BROWSE-05), and edits each
// skill inline in ONE of two mutually-exclusive modes — `Set by level` or `Set XP` (EDIT-03). The filter
// text is LOCAL `useState` (keystrokes never route through the top reducer — RESEARCH Pattern 2); the
// filtered slice is memoised and the list is remounted on query change (`key={q}`) so scroll resets and no
// row keeps a stale value (Pitfall 4). Per-skill mode is held in a panel-level `Record<id, mode>` so it
// survives the virtualizer unmounting/remounting a row on scroll. In `Set by level` mode the EditableCell
// runs `validateLevel(raw, levelCap)` → SET_EDIT on `skill.<id>.level` and a live `levelToXpDisplay` echo
// (DISPLAY-ONLY — main owns the authoritative XP↔Level coupling, never a trust boundary, D-03). In `Set XP`
// mode it runs `validateXp` → SET_EDIT on `skill.<id>.xp`. Switching modes dispatches CLEAR_EDIT for the
// sibling key so a skill's level and xp are NEVER both pending (Pitfall 5 — the reducer also enforces this,
// so a conflicting payload can never leave the renderer). All save-derived strings (skill ids) render as
// React text children (auto-escaped) — no raw-HTML API anywhere (T-05-09, XSS from a crafted save).

import { useMemo, useState } from 'react';
import type { Skill } from '../../../src/view-model';
import type { Action, EditEntry } from '../state/reducer';
import { matches } from '../lib/filter';
import { validateLevel, validateXp } from '../lib/validation';
import { levelToXpDisplay } from '../lib/format';
import { EditableCell } from './EditableCell';
import { VirtualList } from './VirtualList';

/** The per-skill edit mode — mutually exclusive (Pitfall 5): a skill edits level XOR xp, never both. */
type SkillMode = 'level' | 'xp';

/** Props for the skill panel. Receives the skills, the accumulator (to seed edits), and dispatch. */
export interface SkillPanelProps {
  /** The skills (entities with an Experience component) to browse/filter/edit. */
  skills: Skill[];
  /** The D-02 edit accumulator (fieldKey → entry); used to seed a row's in-progress level/xp. */
  edits: Record<string, EditEntry>;
  /** The top reducer's dispatch — a valid edit dispatches SET_EDIT, an invalid one CLEAR_EDIT. */
  dispatch: React.Dispatch<Action>;
}

/**
 * The skill browse panel: a heading, an as-you-type filter input, and a virtualized list of skills
 * with a per-skill `Set by level` / `Set XP` mode toggle and inline editing. When the filter matches
 * nothing, shows the UI-SPEC empty copy (the "items"→"skills" variant).
 */
export function SkillPanel({ skills, edits, dispatch }: SkillPanelProps): React.ReactElement {
  // Filter text stays LOCAL — keystrokes never route through the top reducer (RESEARCH Pattern 2).
  const [q, setQ] = useState('');
  // Per-skill mode, panel-level so it survives a row unmount/remount on scroll (Pitfall 4).
  const [modes, setModes] = useState<Record<string, SkillMode>>({});
  const filtered = useMemo(() => skills.filter((s) => matches(q, s.id)), [skills, q]);

  const renderRow = (skill: Skill): React.ReactNode => {
    const levelKey = `skill.${skill.id}.level`;
    const xpKey = `skill.${skill.id}.xp`;
    // Default mode: XP if an xp edit is already pending, else level (the "Set by level" default surface).
    const mode: SkillMode = modes[skill.id] ?? (edits[xpKey] !== undefined ? 'xp' : 'level');

    // Switch mode and CLEAR_EDIT the sibling key so level + xp are never both pending (Pitfall 5).
    const switchTo = (next: SkillMode): void => {
      setModes((m) => ({ ...m, [skill.id]: next }));
      dispatch({ t: 'CLEAR_EDIT', fieldKey: next === 'level' ? xpKey : levelKey });
    };

    // Live level→XP echo (display-only, D-03): the current valid pending level, else the loaded level.
    const levelEntry = edits[levelKey];
    const echoLevel =
      levelEntry?.valid === true ? Number(levelEntry.value) : skill.level;

    const levelSeed = levelEntry?.raw ?? String(skill.level);
    const xpSeed = edits[xpKey]?.raw ?? String(skill.xp);

    return (
      <>
        <span className="mono">{skill.id}</span>
        <span className="column-header">lvl {skill.level}</span>
        <span className="column-header">xp {skill.xp}</span>
        <button
          type="button"
          className="btn"
          aria-pressed={mode === 'level'}
          onClick={(): void => switchTo('level')}
        >
          Set by level
        </button>
        <button
          type="button"
          className="btn"
          aria-pressed={mode === 'xp'}
          onClick={(): void => switchTo('xp')}
        >
          Set XP
        </button>
        {mode === 'level' ? (
          <>
            <EditableCell
              value={levelSeed}
              validate={(raw): ReturnType<typeof validateLevel> => validateLevel(raw, skill.levelCap)}
              mono
              onValid={(value, raw): void => {
                const nextEntry: EditEntry = { raw, value, valid: true };
                dispatch({ t: 'SET_EDIT', fieldKey: levelKey, entry: nextEntry });
              }}
              onInvalid={(): void => {
                // Invalid contributes no edit (D-04) — drop any prior valid level entry.
                dispatch({ t: 'CLEAR_EDIT', fieldKey: levelKey });
              }}
            />
            {/* Live level→XP echo — display-only reuse of the golden table (D-03), never a trust boundary. */}
            <span className="mono column-header">= {levelToXpDisplay(echoLevel)} XP</span>
          </>
        ) : (
          <EditableCell
            value={xpSeed}
            validate={validateXp}
            mono
            onValid={(value, raw): void => {
              const nextEntry: EditEntry = { raw, value, valid: true };
              dispatch({ t: 'SET_EDIT', fieldKey: xpKey, entry: nextEntry });
            }}
            onInvalid={(): void => {
              // Invalid contributes no edit (D-04) — drop any prior valid xp entry.
              dispatch({ t: 'CLEAR_EDIT', fieldKey: xpKey });
            }}
          />
        )}
      </>
    );
  };

  const isFilteredEmpty = filtered.length === 0 && q !== '';

  return (
    <div className="panel">
      <h2 className="panel-title">Skills</h2>
      <input
        className="input"
        type="text"
        value={q}
        placeholder="Filter skills…"
        aria-label="Filter skills"
        onChange={(e): void => setQ(e.target.value)}
      />
      {isFilteredEmpty ? (
        <div className="empty-state">
          <p className="panel-title">No matches</p>
          <p className="column-header">
            No skills match &quot;{q}&quot;. Clear the filter to see all skills.
          </p>
        </div>
      ) : (
        // Remount on query change (`key={q}`) → fresh scroll element resets scroll to top (Pitfall 4).
        <VirtualList<Skill>
          key={q}
          items={filtered}
          getKey={(s): string => s.id}
          renderRow={renderRow}
        />
      )}
    </div>
  );
}
