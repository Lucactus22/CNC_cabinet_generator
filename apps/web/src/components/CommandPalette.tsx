import { useEffect, useMemo, useRef, useState } from 'react';
import { search, type CatalogEntry } from '../catalog';
import { searchTopics, type Topic } from '../explain/topics';
import { useGoTo } from '../navigate';
import { useStore } from '../store';
import { useDialog } from './overlays';

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
  // Mounted only while it is up, so `useDialog` below has a mount to hang the
  // focus on. The palette used to render `null` from a component that never
  // unmounts, which is fine for markup and useless for focus.
  return open ? <Palette /> : null;
}

function Palette() {
  const setOpen = useStore((s) => s.setPaletteOpen);
  const setShowroom = useStore((s) => s.setShowroom);
  const { toEntry } = useGoTo();

  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const dialog = useDialog<HTMLDivElement>();

  // After `useDialog` has focused the dialog itself: for this one overlay the
  // field is the whole point, so typing can start straight away.
  useEffect(() => {
    input.current?.focus();
  }, []);

  const results = useMemo(() => search(query).slice(0, 10), [query]);
  const topics = useMemo(() => searchTopics(query).slice(0, 4), [query]);

  // `reveal` shuts the palette itself, so there is nothing to close here.
  const go = (entry: CatalogEntry): void => toEntry(entry);
  const explain = (topic: Topic): void => {
    setOpen(false);
    setShowroom({ topicId: topic.id });
  };

  return (
    <div className="palette-backdrop" onClick={() => setOpen(false)} role="presentation">
      <div
        className="palette"
        ref={dialog}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
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
              // The palette eats the key. Without this, Enter's default action
              // lands on whatever `reveal` has just moved focus to — and where
              // that is a gallery of options, the first one gets *picked*.
              // Searching "knock-down" quietly set the carcass joint to
              // stopped dado, which is the class of failure this app exists
              // not to have.
              e.preventDefault();
              go(results[cursor]!.entry);
            }
          }}
        />
        {query.trim() !== '' && results.length === 0 && topics.length === 0 && (
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
        {topics.length > 0 && (
          <ul className="palette-topics">
            {topics.map(({ topic }) => (
              <li key={topic.id}>
                <button onClick={() => explain(topic)}>
                  <b>{topic.title}</b>
                  <span className="where">What it is</span>
                  <span className="about">{topic.what}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
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
