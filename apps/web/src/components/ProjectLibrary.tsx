import { useRef, useState } from 'react';
import { useStore } from '../store';

/**
 * Distinct from autosave: autosave silently remembers whatever is open right
 * now, this is designs the user chose to keep, under a name, so a base-unit
 * run or a wall-cabinet test is still there next time without hunting
 * through downloaded JSON files.
 */
export function ProjectLibrary() {
  const library = useStore((s) => s.library);
  const saveToLibrary = useStore((s) => s.saveToLibrary);
  const loadFromLibrary = useStore((s) => s.loadFromLibrary);
  const deleteFromLibrary = useStore((s) => s.deleteFromLibrary);
  const [name, setName] = useState('');
  const details = useRef<HTMLDetailsElement>(null);

  const save = (): void => {
    if (!name.trim()) return;
    saveToLibrary(name);
    setName('');
    if (details.current) details.current.open = false;
  };

  const open = (id: string): void => {
    loadFromLibrary(id);
    if (details.current) details.current.open = false;
  };

  return (
    <details className="menu" ref={details}>
      <summary>Library{library.length > 0 ? ` (${library.length})` : ''}</summary>
      <div className="panel">
        <div className="menu-save">
          <input
            placeholder="Name this design…"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save();
            }}
          />
          <button onClick={save} disabled={!name.trim()}>
            Save
          </button>
        </div>
        {library.length === 0 ? (
          <p className="hint">
            Nothing saved here yet. Saved designs stay in this browser, so this is a shelf, not a
            backup — Save still writes a project file you can keep anywhere.
          </p>
        ) : (
          <ul className="menu-list">
            {[...library].reverse().map((entry) => (
              <li key={entry.id}>
                <button
                  className="menu-item"
                  onClick={() => open(entry.id)}
                  title={new Date(entry.savedAt).toLocaleString()}
                >
                  {entry.name}
                </button>
                <button
                  className="menu-delete"
                  title={`Delete "${entry.name}"`}
                  onClick={() => {
                    if (confirm(`Delete "${entry.name}" from your saved projects?`)) {
                      deleteFromLibrary(entry.id);
                    }
                  }}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}
