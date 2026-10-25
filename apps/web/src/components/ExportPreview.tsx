import { useMemo } from 'react';
import { defaultExportOptions, exportProject, slug } from '@cabgen/core';
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
  const safeNames = useStore((s) => s.safeNames);
  const setExportPreviewOpen = useStore((s) => s.setExportPreviewOpen);
  const setDiagnosticsOpen = useStore((s) => s.setDiagnosticsOpen);

  const building = useStore((s) => s.building);
  const buildError = useStore((s) => s.buildError);

  const sheets = useSheetViews(project);
  const warnings = project.diagnostics.filter((d) => d.severity === 'warning').length;
  const errors = project.diagnostics.filter((d) => d.severity === 'error').length;
  // Built once and shown before it is written, so the instructions read here
  // are the instructions in the zip: which hole was left off a seam, when a
  // sheet is turned over, how a profile crossing a seam is cut. Nothing else
  // in the app says any of them.
  const bundle = useMemo(
    () => exportProject(project, { ...defaultExportOptions(), safeNames }),
    [project, safeNames],
  );
  const instructionsFile = bundle.files.find((f) => f.name.endsWith('-before-you-cut.txt'))?.name;
  // The top bar only checks this when it opens the preview, and an undo still
  // works while the preview is up: the design underneath can change, be
  // half-built or stop being cuttable after this opened.
  const notNow =
    buildError !== null
      ? `${buildError} What is shown here is older than the design, so it cannot be downloaded.`
      : building
        ? 'Still catching up to your last change — wait a moment.'
        : errors > 0
          ? `The design now has ${errors} blocking problem${errors === 1 ? '' : 's'}, so it cannot be downloaded.`
          : null;

  const close = (): void => setExportPreviewOpen(false);

  const download = (): void => {
    if (building) return;
    if (notNow !== null) {
      close();
      setDiagnosticsOpen(true);
      return;
    }
    // Named off the design the files were written from, the same way every
    // file inside it is.
    saveBlob(
      zipFiles(bundle.files.map((f) => ({ name: f.name, content: f.dxf }))),
      `${slug(project.params.name)}-cnc.zip`,
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

        {bundle.warnings.length > 0 && (
          <div className="export-instructions">
            <h3>Before you cut</h3>
            <p className="hint">
              Also in the zip, as <code>{instructionsFile}</code>, to read at the machine.
            </p>
            <ol>
              {bundle.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ol>
          </div>
        )}

        {notNow !== null && (
          <p className="export-not-now" role="status">
            {notNow}
          </p>
        )}

        <div className="export-preview-actions">
          <button onClick={close}>Back to the design</button>
          <button
            className={`primary${notNow !== null && !building ? ' blocked' : ''}`}
            onClick={download}
            title={notNow ?? 'Download every sheet, tile and list as one zip.'}
          >
            {notNow !== null && !building ? 'See what is blocking it' : 'Download the zip'}
          </button>
        </div>
      </section>
    </div>
  );
}
