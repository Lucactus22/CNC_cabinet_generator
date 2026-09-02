import { defaultExportOptions, exportProject } from '@cabgen/core';
import { useStore } from '../store';
import { saveBlob, zipFiles } from '../download';
import { useSheetViews } from '../sheetViews';
import { DrawingSvg } from './drawing';
import { useDialog } from './overlays';

/**
 * What is about to be produced, shown once before the zip actually
 * downloads — the last moment before real material gets committed. R-22's
 * own reasoning: a beat to look at the sheets, the yield and the shopping
 * list, rather than a silent download.
 *
 * Every thumbnail and every number here is read straight off `project` —
 * `useSheetViews` is the same composition `SheetView` draws full size and
 * `exportProject` writes to disk, and `project.materials` /
 * `project.stockMaterials` / `project.hardware` / `project.banding` are the
 * same summaries the pipeline already computed. Nothing is recomputed for
 * this panel, so it cannot show something the actual export disagrees with.
 */
export function ExportPreview() {
  const dialog = useDialog<HTMLElement>();
  const project = useStore((s) => s.project);
  const params = useStore((s) => s.params);
  const safeNames = useStore((s) => s.safeNames);
  const setExportPreviewOpen = useStore((s) => s.setExportPreviewOpen);
  const setDiagnosticsOpen = useStore((s) => s.setDiagnosticsOpen);

  const sheets = useSheetViews(project);
  const warnings = project.diagnostics.filter((d) => d.severity === 'warning').length;

  const close = (): void => setExportPreviewOpen(false);

  const download = (): void => {
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
    close();
  };

  return (
    <div className="scrim" onClick={close} role="presentation">
      <section
        className="export-preview"
        ref={dialog}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Export preview"
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          <h2>About to cut</h2>
          <button className="crumb dismiss" aria-label="Close" onClick={close}>
            ✕
          </button>
        </header>
        <p className="hint">
          {sheets.length} sheet{sheets.length === 1 ? '' : 's'} · {project.parts.length} parts ·{' '}
          {project.assembly.steps.length} assembly steps
          {warnings > 0 && (
            <>
              {' · '}
              <button
                className="link"
                onClick={() => {
                  close();
                  setDiagnosticsOpen(true);
                }}
              >
                {warnings} warning{warnings === 1 ? '' : 's'} to check
              </button>
            </>
          )}
        </p>

        <div className="export-thumbs">
          {sheets.map(({ sheet, label, drawing, tiles, material }) => (
            <div className="export-thumb" key={`${label}-${sheet.index}`}>
              <svg
                viewBox={`-10 -10 ${sheet.length + 20} ${sheet.width + 20}`}
                preserveAspectRatio="xMidYMid meet"
              >
                <g transform={`translate(0, ${sheet.width}) scale(1, -1)`}>
                  <rect
                    x={0}
                    y={0}
                    width={sheet.length}
                    height={sheet.width}
                    style={{ fill: 'var(--pic-bg)' }}
                  />
                  <DrawingSvg drawing={drawing} showLabels={false} />
                </g>
              </svg>
              <span>
                {label} {sheet.index + 1} — {material ?? sheet.materialId}
                {tiles ? `, ${tiles.tiles.length} setups` : ''}
              </span>
            </div>
          ))}
        </div>

        <div className="export-summary">
          {project.materials.length > 0 && (
            <div>
              <h3>Sheets to order</h3>
              <ul>
                {project.materials.map((m) => (
                  <li key={m.material}>
                    {m.sheets} × {m.material}{' '}
                    <span className="hint">
                      ({m.parts} part{m.parts === 1 ? '' : 's'}, {m.area} m²)
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {project.stockMaterials.length > 0 && (
            <div>
              <h3>Solid stock to order</h3>
              <ul>
                {project.stockMaterials.map((m) => (
                  <li key={m.material}>
                    {m.boards} board{m.boards === 1 ? '' : 's'} × {m.material}{' '}
                    <span className="hint">({m.length} mm total)</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {project.hardware.length > 0 && (
            <div>
              <h3>Hardware to order</h3>
              <ul>
                {project.hardware.map((h) => (
                  <li key={`${h.kind}-${h.name}-${h.detail ?? ''}`}>
                    {h.quantity} {h.unit}
                    {h.quantity === 1 ? '' : 's'} × {h.name}
                    {h.detail ? ` (${h.detail})` : ''}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {project.banding.length > 0 && (
            <div>
              <h3>Edge tape to order</h3>
              <ul>
                {project.banding.map((b) => (
                  <li key={b.material}>
                    {b.length} mm × {b.material}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="export-preview-actions">
          <button onClick={close}>Back to the design</button>
          <button className="primary" onClick={download}>
            Download the zip
          </button>
        </div>
      </section>
    </div>
  );
}
