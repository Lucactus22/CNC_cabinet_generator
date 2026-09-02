import { defaultExportOptions, exportProject } from '@cabgen/core';
import { useStore } from '../store';
import { saveBlob, zipFiles } from '../download';
import { SheetView } from './SheetView';
import { PartView } from './PartView';
import { BuildGuide } from './BuildGuide';

/**
 * The pack you take to the machine, in one printable run.
 *
 * Sheets, the cut list, the part drawing, the labels and the assembly steps
 * used to be three tabs and a fourth for the guide. In the workshop they are
 * one job: you want the sheet layout, the cut list, the labels and the steps
 * together and printable, not behind three tabs — so they are sections of one
 * document, and the split that is left is the honest one, between designing
 * and standing at the machine.
 */
export function OutputPack() {
  const project = useStore((s) => s.project);
  const params = useStore((s) => s.params);
  const building = useStore((s) => s.building);
  const safeNames = useStore((s) => s.safeNames);
  const setSafeNames = useStore((s) => s.setSafeNames);
  const setDiagnosticsOpen = useStore((s) => s.setDiagnosticsOpen);

  const hasErrors = project.diagnostics.some((d) => d.severity === 'error');
  const blocked = building || hasErrors;

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

  return (
    <div className="pack">
      <div className="pack-toolbar no-print">
        <button className="primary" onClick={() => window.print()}>
          Print the pack
        </button>
        <button
          // Red only for an actual error — a rebuild in flight is not a
          // problem, and painting it the same red as one would say it is.
          className={hasErrors ? 'blocked' : undefined}
          onClick={() => {
            if (building) return;
            if (blocked) setDiagnosticsOpen(true);
            else doExport();
          }}
          title={
            building
              ? 'Still catching up to your last change — wait a moment and try again.'
              : blocked
                ? 'Blocked — click to see what is stopping it.'
                : undefined
          }
        >
          Export DXF
        </button>
        <label
          className="pill toggle"
          title="Writes POCKET_D6P35 instead of POCKET_D6.35, for importers that dislike dots."
        >
          <input
            type="checkbox"
            checked={safeNames}
            onChange={(e) => setSafeNames(e.target.checked)}
          />
          safe layer names
        </label>
        <span className="hint" style={{ margin: 0 }}>
          {project.nest.sheets.length} sheets · {project.parts.length} parts ·{' '}
          {project.assembly.steps.length} steps
        </span>
        <span className="spacer" />
        {/* One sheet fills a screen, so the pack is long by the time it is
            useful. Jumping to a section beats scrolling past four sheets to
            reach the cut list. */}
        {(['sheets', 'parts', 'guide'] as const).map((id) => (
          <button
            key={id}
            className="link"
            onClick={() => document.getElementById(`pack-${id}`)?.scrollIntoView()}
          >
            {id === 'guide' ? 'labels & steps' : id}
          </button>
        ))}
      </div>

      <section className="pack-section" id="pack-sheets">
        <h2>Sheets</h2>
        <SheetView />
      </section>

      <section className="pack-section" id="pack-parts">
        <h2>Parts</h2>
        <PartView />
      </section>

      <section className="pack-section" id="pack-guide">
        <BuildGuide />
      </section>
    </div>
  );
}
