import { breadcrumb } from '../selection';
import { useStore } from '../store';
import { RunInspector } from './inspector/RunInspector';
import { CabinetInspector } from './inspector/CabinetInspector';
import { CarcassInspector } from './inspector/CarcassInspector';
import { BayInspector } from './inspector/BayInspector';
import { PartInspector } from './inspector/PartInspector';
import { SuggestionLine } from './Suggestion';

/**
 * What applies to what is selected, next to it.
 *
 * This is the single largest change R-17 makes: the old sidebar showed every
 * parameter in the project at a flat, equal weight, and answered a click on a
 * panel with fourteen characters 5224 px down the column. Here a click on
 * anything brings up that thing's own controls and nothing else.
 *
 * It floats over the model rather than dividing the window, so the cabinet
 * keeps the space; selecting the run — which is what "nothing selected" means
 * — leaves it showing the project itself rather than an empty state.
 *
 * It stays docked at one corner, wherever the selection was made. R-20's first
 * version moved the card to whatever had just been clicked in the 3D view, on
 * the reading that a bay's controls should open "in the viewport"; in the
 * running app that put a 300 px panel over the middle of the cabinet, which is
 * the one thing the whole architecture exists to keep clear. Clicking a bay
 * still brings up that bay's controls — the part that was worth having — it
 * just brings them up where the controls always are, which is also where the
 * hand already knows to look.
 */
export function Inspector() {
  const selection = useStore((s) => s.selection);
  const params = useStore((s) => s.params);
  const parts = useStore((s) => s.project.parts);
  const select = useStore((s) => s.select);

  const crumbs = breadcrumb(params, parts, selection);

  return (
    <aside className="inspector" aria-label="Inspector">
      <nav className="crumbs">
        {crumbs.map((crumb, i) => {
          const last = i === crumbs.length - 1;
          return (
            <span key={i}>
              {i > 0 && <i className="sep">›</i>}
              {last ? (
                <b>{crumb.label}</b>
              ) : (
                <button className="crumb" onClick={() => select(crumb.to)}>
                  {crumb.label}
                </button>
              )}
            </span>
          );
        })}
        {selection.kind !== 'run' && (
          <button
            className="crumb dismiss"
            title="Back to the run (Esc)"
            aria-label="Back to the run"
            onClick={() => select({ kind: 'run' })}
          >
            ✕
          </button>
        )}
      </nav>

      <div className="inspector-body">
        {selection.kind === 'run' && <RunInspector />}
        {selection.kind === 'cabinet' && <CabinetInspector cabinetId={selection.cabinetId} />}
        {selection.kind === 'carcass' && (
          <CarcassInspector cabinetId={selection.cabinetId} carcassId={selection.carcassId} />
        )}
        {selection.kind === 'bay' && (
          <BayInspector
            cabinetId={selection.cabinetId}
            carcassId={selection.carcassId}
            bay={selection.bay}
          />
        )}
        {selection.kind === 'part' && <PartInspector partId={selection.partId} />}
      </div>

      {/* Under the controls rather than among them, and outside the part that
          scrolls: it must never push a control down to make room for itself,
          and equally must not end up 600 px below the fold where it would be
          spent without ever being read. */}
      <SuggestionLine />
    </aside>
  );
}
