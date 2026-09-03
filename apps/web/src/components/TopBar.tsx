import { useCallback, useEffect, useRef, useState } from 'react';
import { cabinetPositions, normaliseParams } from '@cabgen/core';
import { useStore } from '../store';
import { saveText } from '../download';
import { summarise } from '../diagnosticsGrouping';
import { isWorkshopTopic } from '../diagnosticTopics';
import { THEME_CHOICES } from '../theme';
import { useDismissable } from './overlays';

/**
 * The one row that is always there: what this is, whether it can be cut, and
 * the two doors off the bench.
 *
 * The readiness chip is the whole of what used to be a permanently open
 * diagnostics panel taking a quarter of the window. It is global — it says
 * what is blocking wherever you are — and it opens the list over the model
 * rather than beside it.
 */
export function TopBar() {
  const params = useStore((s) => s.params);
  const project = useStore((s) => s.project);
  const building = useStore((s) => s.building);
  const surface = useStore((s) => s.surface);
  const setSurface = useStore((s) => s.setSurface);
  const workshopOpen = useStore((s) => s.workshopOpen);
  const setWorkshopOpen = useStore((s) => s.setWorkshopOpen);
  const diagnosticsOpen = useStore((s) => s.diagnosticsOpen);
  const setDiagnosticsOpen = useStore((s) => s.setDiagnosticsOpen);
  const setPaletteOpen = useStore((s) => s.setPaletteOpen);
  const setStartersOpen = useStore((s) => s.setStartersOpen);
  const setShowroom = useStore((s) => s.setShowroom);
  const past = useStore((s) => s.past);
  const future = useStore((s) => s.future);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const load = useStore((s) => s.load);
  const setExportPreviewOpen = useStore((s) => s.setExportPreviewOpen);
  const atMachine = useStore((s) => s.atMachine);
  const setAtMachine = useStore((s) => s.setAtMachine);

  const [menuOpen, setMenuOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const errors = project.diagnostics.filter((d) => d.severity === 'error').length;
  const warnings = project.diagnostics.filter((d) => d.severity === 'warning').length;
  // The workshop door's own badge: visible without opening it, and scoped to
  // what actually lives behind it, so it never claims a design problem is
  // fixable in there.
  const workshopErrors = project.diagnostics.filter(
    (d) => d.severity === 'error' && isWorkshopTopic(d.topic),
  ).length;
  // `project` runs a build behind `params` while the worker is still catching
  // up (R-12), so exporting mid-build would cut whatever the previous params
  // produced — wrong dimensions, or a blocking error the new params would
  // have raised that this stale `project` does not carry yet.
  const blocked = building || errors > 0;

  const runWidth = cabinetPositions(params.cabinets).reduce((a, c) => a + c.w, 0);
  const height = Math.max(
    0,
    ...params.cabinets.map((c) => c.carcasses.reduce((a, k) => a + k.height, 0)),
  );

  const openProject = async (file: File): Promise<void> => {
    try {
      const parsed = JSON.parse(await file.text()) as Record<string, unknown>;
      // A 0.1 file has `base` and `top` where a current one has `cabinets`.
      // Both open: normaliseParams turns the old pair into one cabinet.
      const looksLikeAProject = parsed.cabinets || parsed.base || parsed.top;
      if (!parsed.materials || !looksLikeAProject) throw new Error('not a project file');
      // Merged over the defaults, so a file saved before a setting existed
      // still opens instead of producing NaNs downstream.
      load(normaliseParams(parsed));
    } catch (e) {
      alert(`Could not open that project file: ${(e as Error).message}`);
    }
  };

  return (
    <header className="topbar no-print">
      <ProjectMenu
        open={menuOpen}
        setOpen={setMenuOpen}
        onShowroom={() => setShowroom({ topicId: null })}
        onStartFrom={() => setStartersOpen(true)}
        onOpenFile={() => fileInput.current?.click()}
        onSaveFile={() =>
          saveText(JSON.stringify(params, null, 2), 'cabinet-project.json', 'application/json')
        }
      />
      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void openProject(f);
          e.target.value = '';
        }}
      />

      <h1>{params.name}</h1>
      <span className="badge">
        {runWidth.toFixed(0)} × {height.toFixed(0)} mm · {project.parts.length} parts ·{' '}
        {project.nest.sheets.length} sheets{building ? ' · updating…' : ''}
      </span>

      <span className="spacer" />

      <button
        className="find"
        onClick={() => setPaletteOpen(true)}
        title="Find any setting by name (Ctrl+K)"
      >
        Find… <kbd>⌘K</kbd>
      </button>

      <button onClick={undo} disabled={past.length === 0} title="Undo (Ctrl+Z)" aria-label="Undo">
        ↶
      </button>
      <button
        onClick={redo}
        disabled={future.length === 0}
        title="Redo (Ctrl+Shift+Z)"
        aria-label="Redo"
      >
        ↷
      </button>

      <button
        className={`chip ${errors ? 'error' : warnings ? 'warning' : 'ok'}`}
        aria-expanded={diagnosticsOpen}
        onClick={() => setDiagnosticsOpen(!diagnosticsOpen)}
        title="What stands between this and the machine"
      >
        <i className={`dot ${errors ? 'error' : warnings ? 'warning' : 'ok'}`} />
        {summarise(project.diagnostics)}
      </button>

      <button
        aria-pressed={workshopOpen}
        className={workshopOpen ? 'on' : undefined}
        onClick={() => setWorkshopOpen(!workshopOpen)}
        title="The machine, the tooling, the sheets and the hardware — the shop, not the cabinet"
      >
        Workshop
        {workshopErrors > 0 && <span className="badge-count">{workshopErrors}</span>}
      </button>
      <button
        aria-pressed={surface === 'output'}
        className={surface === 'output' ? 'on' : undefined}
        onClick={() => setSurface(surface === 'output' ? 'bench' : 'output')}
        title="Sheets, cut list, part drawings, labels and assembly steps — the pack you take to the machine"
      >
        Output
      </button>
      <button
        aria-pressed={atMachine}
        className={atMachine ? 'on' : undefined}
        onClick={() => setAtMachine(!atMachine)}
        title="Large type, one step at a time — cutting and assembly, meant to be read standing at the machine"
      >
        At the machine
      </button>
      <button
        // Red only for an actual error — a rebuild in flight is not a
        // problem, and painting it the same red as one would say it is.
        className={`primary${errors > 0 ? ' blocked' : ''}`}
        onClick={() => {
          // A disabled button cannot explain itself, and `aria-disabled`
          // would tell a screen reader it does nothing when it still does —
          // this one stays a normal, focusable button, and clicking it while
          // blocked opens the list that says why, rather than only refusing.
          if (building) return;
          if (blocked) setDiagnosticsOpen(true);
          else setExportPreviewOpen(true);
        }}
        title={
          building
            ? 'Still catching up to your last change — wait a moment and try again.'
            : blocked
              ? 'Blocked — click to see what is stopping it.'
              : 'See what is about to be cut, then download the zip.'
        }
      >
        Export DXF
      </button>
    </header>
  );
}

/**
 * Everything about the file rather than the design: opening, saving, the
 * library of designs kept in this browser, and starting again.
 */
function ProjectMenu({
  open,
  setOpen,
  onShowroom,
  onStartFrom,
  onOpenFile,
  onSaveFile,
}: {
  open: boolean;
  setOpen: (v: boolean) => void;
  onShowroom: () => void;
  onStartFrom: () => void;
  onOpenFile: () => void;
  onSaveFile: () => void;
}) {
  const library = useStore((s) => s.library);
  const saveToLibrary = useStore((s) => s.saveToLibrary);
  const loadFromLibrary = useStore((s) => s.loadFromLibrary);
  const deleteFromLibrary = useStore((s) => s.deleteFromLibrary);
  const reset = useStore((s) => s.reset);
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const [name, setName] = useState('');
  const close = useCallback(() => setOpen(false), [setOpen]);
  const host = useDismissable<HTMLDivElement>(open, close);

  /**
   * Shut the menu and do the thing, leaving the keyboard on the ☰ button.
   *
   * Without the focus move, the item that was clicked is unmounted before
   * whatever it opened has mounted, so a modal reading `document.activeElement`
   * for somewhere to return focus to finds `body` — and closing the showroom
   * drops the keyboard at the top of the document.
   */
  const choose = (act: () => void): void => {
    host.current?.querySelector<HTMLElement>('[aria-expanded]')?.focus();
    setOpen(false);
    act();
  };

  return (
    <div className="menu" ref={host}>
      <button
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        title="Open, save, reset and appearance"
        aria-label="Project menu"
      >
        ☰
      </button>
      {open && (
        <div className="panel">
          <div className="row">
            <button
              onClick={() => choose(onStartFrom)}
              title="Real cabinets to start from, shown as renders of what each one makes"
            >
              Start from a design…
            </button>
            {/* Behind the door rather than in the top bar: the resting control
                count is a budget R-17 set and this is not worth one of them. */}
            <button
              onClick={() => choose(onShowroom)}
              title="Every joint, panel, front and surface this can cut, rendered"
            >
              What this can make…
            </button>
            <button onClick={() => choose(onOpenFile)}>Open a file…</button>
            <button onClick={() => choose(onSaveFile)}>Save a file</button>
            <button onClick={() => choose(reset)}>Start again</button>
          </div>

          {/* Behind the door rather than in the top bar: the resting control
              count is a budget R-17 set, and appearance is chosen once and
              then left alone. Starting on "System" is what makes that
              affordable — most people never open this at all. */}
          <strong>Appearance</strong>
          <div className="menu-theme" role="group" aria-label="Appearance">
            {THEME_CHOICES.map((choice) => (
              <button
                key={choice.id}
                className={theme === choice.id ? 'on' : undefined}
                aria-pressed={theme === choice.id}
                title={choice.title}
                onClick={() => setTheme(choice.id)}
              >
                {choice.label}
              </button>
            ))}
          </div>

          <strong>Designs kept in this browser</strong>
          <div className="menu-save">
            <input
              aria-label="Name this design"
              placeholder="Name this design…"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && name.trim()) {
                  saveToLibrary(name);
                  setName('');
                  setOpen(false);
                }
              }}
            />
            <button
              disabled={!name.trim()}
              onClick={() => {
                saveToLibrary(name);
                setName('');
                setOpen(false);
              }}
            >
              Keep
            </button>
          </div>
          {library.length === 0 ? (
            <p className="hint">
              Nothing kept here yet. This is a shelf, not a backup — Save a file still writes a
              project you can keep anywhere.
            </p>
          ) : (
            <ul className="menu-list">
              {[...library].reverse().map((entry) => (
                <li key={entry.id}>
                  <button
                    className="menu-item"
                    title={new Date(entry.savedAt).toLocaleString()}
                    onClick={() => {
                      loadFromLibrary(entry.id);
                      setOpen(false);
                    }}
                  >
                    {entry.name}
                  </button>
                  <button
                    className="menu-delete"
                    title={`Delete "${entry.name}"`}
                    onClick={() => {
                      if (confirm(`Delete "${entry.name}" from your saved designs?`)) {
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
      )}
    </div>
  );
}

/**
 * The keyboard, everywhere except inside a field with its own native undo — a
 * stray project-level undo mid-keystroke would be far more surprising than
 * doing nothing.
 */
export function useShortcuts(): void {
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const setPaletteOpen = useStore((s) => s.setPaletteOpen);
  const select = useStore((s) => s.select);
  const setDiagnosticsOpen = useStore((s) => s.setDiagnosticsOpen);
  const setWorkshopOpen = useStore((s) => s.setWorkshopOpen);
  const setStartersOpen = useStore((s) => s.setStartersOpen);
  const setShowroom = useStore((s) => s.setShowroom);
  const setExportPreviewOpen = useStore((s) => s.setExportPreviewOpen);
  const setAtMachine = useStore((s) => s.setAtMachine);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT';
      if (e.key === 'Escape') {
        setDiagnosticsOpen(false);
        setWorkshopOpen(false);
        setPaletteOpen(false);
        setStartersOpen(false);
        setShowroom(null);
        setExportPreviewOpen(false);
        setAtMachine(false);
        if (!typing) select({ kind: 'run' });
        return;
      }
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === 'k') {
        e.preventDefault();
        setPaletteOpen(true);
      } else if (!typing && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (!typing && key === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [
    undo,
    redo,
    setPaletteOpen,
    select,
    setDiagnosticsOpen,
    setWorkshopOpen,
    setStartersOpen,
    setShowroom,
    setExportPreviewOpen,
    setAtMachine,
  ]);
}
