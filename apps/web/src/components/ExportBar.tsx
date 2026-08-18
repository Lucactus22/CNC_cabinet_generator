import { useRef, useState } from 'react';
import { defaultExportOptions, exportProject, normaliseParams } from '@cabgen/core';
import { useStore } from '../store';
import { saveText, saveBlob, zipFiles } from '../download';

export function ExportBar() {
  const project = useStore((s) => s.project);
  const params = useStore((s) => s.params);
  const load = useStore((s) => s.load);
  const reset = useStore((s) => s.reset);
  const [safeNames, setSafeNames] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const blocked = project.diagnostics.some((d) => d.severity === 'error');

  const doExport = (): void => {
    const bundle = exportProject(project, { ...defaultExportOptions(), safeNames });
    const slug = params.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'cabinet';
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
      if (!parsed.materials || !parsed.base || !parsed.top) throw new Error('not a project file');
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
        <input type="checkbox" checked={safeNames} onChange={(e) => setSafeNames(e.target.checked)} />
        safe layer names
      </label>
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
      <button onClick={reset}>Reset</button>
      <button
        className="primary"
        onClick={doExport}
        disabled={blocked}
        title={
          blocked
            ? 'Fix the blocking diagnostics first, or the files will not be cuttable.'
            : 'Sheet DXFs, per-tile DXFs and the cut list, as one zip.'
        }
      >
        Export DXF
      </button>
    </>
  );
}
