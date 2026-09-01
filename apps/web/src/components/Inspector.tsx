import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { breadcrumb, type Selection } from '../selection';
import { useStore, type Anchor } from '../store';
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
 */
export function Inspector() {
  const selection = useStore((s) => s.selection);
  const params = useStore((s) => s.params);
  const parts = useStore((s) => s.project.parts);
  const select = useStore((s) => s.select);
  const anchor = useStore((s) => s.anchor);
  const card = useRef<HTMLElement>(null);
  const at = useAnchoredPosition(card, anchor, selection);

  const crumbs = breadcrumb(params, parts, selection);

  return (
    <aside
      ref={card}
      className={anchor ? 'inspector anchored' : 'inspector'}
      style={at ?? undefined}
      aria-label="Inspector"
    >
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

/** How far a card anchored to a click is held off the point itself. */
const ANCHOR_GAP = 14;
/** And how far it is kept from the edges of the stage. */
const ANCHOR_MARGIN = 12;

/**
 * Put the card next to what was clicked, without letting it off the stage.
 *
 * R-20 asks for a bay's controls to open *in the viewport*, at the bay. This
 * is that, and it is deliberately the same card rather than a second panel: two
 * editors of one value that disagree is the risk the item names, and there is
 * only one editor here — it just moves to the hand.
 */
function useAnchoredPosition(
  card: RefObject<HTMLElement | null>,
  anchor: Anchor | null,
  selection: Selection,
): { left: number; top: number } | null {
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const el = card.current;
    const stage = el?.offsetParent as HTMLElement | null;
    if (!anchor || !el || !stage) {
      setAt(null);
      return;
    }
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    // Clear of the panel or bay itself, not merely of the point clicked: a
    // card sitting on top of the thing it describes is worse than one parked
    // in the corner. Whichever side has room wins, the roomier one on a tie.
    const roomRight = stage.clientWidth - anchor.right - ANCHOR_GAP - ANCHOR_MARGIN;
    const roomLeft = anchor.left - ANCHOR_GAP - ANCHOR_MARGIN;
    const left =
      roomRight >= w || roomRight >= roomLeft
        ? anchor.right + ANCHOR_GAP
        : anchor.left - ANCHOR_GAP - w;
    const top = (anchor.top + anchor.bottom) / 2 - h / 2;
    setAt({
      left: clamp(left, ANCHOR_MARGIN, stage.clientWidth - w - ANCHOR_MARGIN),
      top: clamp(top, ANCHOR_MARGIN, stage.clientHeight - h - ANCHOR_MARGIN),
    });
    // What is selected decides how tall the card is, so it has to place
    // itself again whenever that changes and not only when the click does.
  }, [anchor, card, JSON.stringify(selection)]);

  return at;
}

const clamp = (n: number, lo: number, hi: number): number =>
  Math.min(Math.max(n, lo), Math.max(lo, hi));
