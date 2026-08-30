import { useEffect, useRef, useState } from 'react';
import { defaultExportOptions, exportProject, normaliseParams } from '@cabgen/core';
import { useStore } from '../store';
import { saveText, saveBlob, zipFiles } from '../download';
import { ProjectLibrary } from './ProjectLibrary';

export function ExportBar() {
  const project = useStore((s) => s.project);
  const params = useStore((s) => s.params);
  const building = useStore((s) => s.building);
  const load = useStore((s) => s.load);
  const reset = useStore((s) => s.reset);
  const past = useStore((s) => s.past);
  const future = useStore((s) => s.future);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const [safeNames, setSafeNames] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z (also Ctrl+Y) work anywhere except inside
  // a field that has its own native undo — a stray project-level undo while
  // someone is mid-keystroke in a name field would be far more surprising
  // than doing nothing.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT';
      if (typing || !(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (key === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo]);

  // `project` runs a build behind `params` while the worker is still catching
  // up (R-12), so exporting mid-build would cut whatever the previous params
  // produced — wrong dimensions, or a blocking error the new params would
  // have raised that this stale `project` does not carry yet.
  const blocked = building || project.diagnostics.some((d) => d.severity === 'error');

  const doExport = (): void => {
    const bundle = exportProject(project, { ...defaultExportOptions(), safeNames });
    const slug =
      params.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'cabinet';
    saveBlob(
      zipFiles(bundle.files.map((f) => ({ name: f.name, content: f.dxf }))),
      `${slug}-cnc.zip`,
    );
  };

  const saveProject = (): void =>
    saveText(JSON.stringify(params, null, 2), 'cabinet-project.json', 'application/json');

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
    <>
      <label
        className="pill"
        title="Writes POCKET_D6P35 instead of POCKET_D6.35, for importers that dislike dots."
        style={{ color: 'var(--muted)', cursor: 'pointer' }}
      >
        <input
          type="checkbox"
          checked={safeNames}
          onChange={(e) => setSafeNames(e.target.checked)}
        />
        safe layer names
      </label>
      <button
        onClick={undo}
        disabled={past.length === 0}
        title={past.length > 0 ? 'Undo the last change (Ctrl+Z)' : 'Nothing to undo'}
      >
        Undo
      </button>
      <button
        onClick={redo}
        disabled={future.length === 0}
        title={future.length > 0 ? 'Redo the last undone change (Ctrl+Shift+Z)' : 'Nothing to redo'}
      >
        Redo
      </button>
      <button onClick={() => fileInput.current?.click()}>Open</button>
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
      <button onClick={saveProject}>Save</button>
      <ProjectLibrary />
      <button onClick={reset}>Reset</button>
      <button
        className="primary"
        onClick={doExport}
        disabled={blocked}
        title={
          building
            ? 'Still catching up to your last change — wait a moment and try again.'
            : blocked
              ? 'Fix the blocking diagnostics first, or the files will not be cuttable.'
              : 'Sheet DXFs, per-tile DXFs and the cut list, as one zip.'
        }
      >
        Export DXF
      </button>
    </>
  );
}
