import { useEffect, useMemo, useRef, useState } from 'react';
import { search, selectionFor, type CatalogEntry } from '../catalog';
import { useStore } from '../store';

/**
 * Find by name, over everything.
 *
 * The only route in this interface that helps somebody who has the word but
 * not the place — which today is nobody's route, because there is no search at
 * all. It matches the trade's words as well as the app's: *kickboard* finds
 * the toe kick, *rebate* finds the rabbet, *knock-down* finds tab and slot,
 * *beadboard* finds the grooves. Pulled forward out of R-19 because R-17
 * cannot claim "everything reachable by name" without it.
 */
export function CommandPalette() {
  const open = useStore((s) => s.paletteOpen);
  const setOpen = useStore((s) => s.setPaletteOpen);
  const params = useStore((s) => s.params);
  const selection = useStore((s) => s.selection);
  const reveal = useStore((s) => s.reveal);

  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setCursor(0);
      input.current?.focus();
    }
  }, [open]);

  const results = useMemo(() => search(query).slice(0, 12), [query]);

  if (!open) return null;

  const go = (entry: CatalogEntry): void => {
    if (entry.where.surface === 'workshop') {
      reveal({ surface: 'bench', workshop: true, param: entry.path });
      return;
    }
    reveal({
      surface: 'bench',
      workshop: false,
      selection: selectionFor(entry.where, params, selection),
      param: entry.path,
    });
  };

  return (
    <div className="palette-backdrop" onClick={() => setOpen(false)} role="presentation">
      <div
        className="palette"
        role="dialog"
        aria-label="Find a setting"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={input}
          value={query}
          placeholder="kickboard, rebate, knock-down, beadboard, sheet size…"
          onChange={(e) => {
            setQuery(e.target.value);
            setCursor(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false);
            else if (e.key === 'ArrowDown') {
              e.preventDefault();
              setCursor((c) => Math.min(c + 1, results.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setCursor((c) => Math.max(c - 1, 0));
            } else if (e.key === 'Enter' && results[cursor]) {
              go(results[cursor]!.entry);
            }
          }}
        />
        {query.trim() !== '' && results.length === 0 && (
          <p className="hint">Nothing by that name. Try the word you would use at the bench.</p>
        )}
        <ul>
          {results.map(({ entry }, i) => (
            <li key={entry.path + entry.label}>
              <button
                className={i === cursor ? 'on' : undefined}
                onMouseEnter={() => setCursor(i)}
                onClick={() => go(entry)}
              >
                <b>{entry.label}</b>
                <span className="where">{whereOf(entry)}</span>
                <span className="about">{entry.about}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

const ON_LABEL = {
  run: 'the project',
  cabinet: 'a cabinet',
  carcass: 'a carcass',
  bay: 'a bay',
  part: 'a panel',
} as const;

const whereOf = (entry: CatalogEntry): string =>
  entry.where.surface === 'workshop' ? 'Workshop' : ON_LABEL[entry.where.on];
