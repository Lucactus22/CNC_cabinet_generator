import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { useGoTo } from '../navigate';
import { markSuggestionSeen, suggestionsSeen } from '../persistence';
import { suggestionFor, type Suggestion as Offer } from '../explain/suggestions';

/**
 * One quiet line about something that plainly applies to what you are looking
 * at.
 *
 * R-19 calls this the part most likely to be done badly, and sets the bar:
 * never modal, never animated, never repeated after dismissal, and never shown
 * while the user is mid-action. All four are enforced here rather than left to
 * whoever writes the next suggestion.
 *
 * *Mid-action* is the one that needs saying out loud. A line appearing under
 * the pointer while somebody is clicking through bays is an interruption even
 * if it is polite, so nothing appears until the selection has sat still for a
 * moment, the worker has finished rebuilding, no option is being considered
 * on hover, and nothing is open over the bench.
 */
const SETTLE_MS = 1200;

export function SuggestionLine() {
  const params = useStore((s) => s.params);
  const project = useStore((s) => s.project);
  const selection = useStore((s) => s.selection);
  const building = useStore((s) => s.building);
  const preview = useStore((s) => s.preview);
  const busy = useStore(
    (s) =>
      s.workshopOpen || s.diagnosticsOpen || s.paletteOpen || s.startersOpen || s.showroom !== null,
  );
  const setShowroom = useStore((s) => s.setShowroom);
  const { toParam } = useGoTo();

  const [seen, setSeen] = useState<string[]>(() => suggestionsSeen());

  // Anything that changes what a suggestion would be about restarts the wait,
  // so one only ever surfaces on something the user has stopped and looked at.
  //
  // The wait is recorded as *which* state it settled on rather than as a flag,
  // and that is not fussiness: a flag is set by an effect, which runs after
  // the render that changed the state, so closing the starter gallery showed
  // a suggestion for a single frame — long enough for the once-only rule to
  // spend it, too short for anybody to read. Comparing keys makes the render
  // that changes the context unquiet in that same render.
  const context = `${JSON.stringify(selection)}|${building}|${preview?.tag ?? ''}|${busy}`;
  const [settledFor, setSettledFor] = useState<string | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setSettledFor(context), SETTLE_MS);
    return () => clearTimeout(t);
  }, [context]);

  const quiet = settledFor === context && !building && preview === null && !busy;
  const offer = quiet ? suggestionFor({ params, project, selection }, seen) : null;

  // Shown once and spent, whatever became of it — acted on, dismissed, or
  // simply left behind by selecting something else. A tip that comes back is
  // the failure this rule exists to prevent.
  const showing = useRef<Offer | null>(null);
  useEffect(() => {
    const previous = showing.current;
    if (previous && previous.id !== offer?.id) {
      markSuggestionSeen(previous.id);
      setSeen((s) => (s.includes(previous.id) ? s : [...s, previous.id]));
    }
    showing.current = offer;
  }, [offer]);

  // Leaving the bench for the output pack unmounts the inspector, which the
  // effect above never sees. Without this a suggestion would come back on the
  // way in again, which is the one thing these promised not to do. Safe under
  // React's development double-mount: at that point nothing is being offered
  // yet, so there is nothing to spend.
  useEffect(
    () => () => {
      if (showing.current) markSuggestionSeen(showing.current.id);
    },
    [],
  );

  if (!offer) return null;

  const spend = (): void => {
    markSuggestionSeen(offer.id);
    setSeen((s) => [...s, offer.id]);
  };

  return (
    <aside className="suggestion" aria-label="Something this could do">
      <p>{offer.says}</p>
      <div className="suggestion-actions">
        <button
          className="link"
          onClick={() => {
            spend();
            toParam(offer.param);
          }}
        >
          Show me
        </button>
        <button
          className="link"
          onClick={() => {
            spend();
            setShowroom({ topicId: offer.topicId });
          }}
        >
          What is that?
        </button>
        <span className="spacer" />
        <button
          className="crumb dismiss"
          aria-label="Dismiss, and do not show this again"
          title="Dismiss, and do not show this again"
          onClick={spend}
        >
          ✕
        </button>
      </div>
    </aside>
  );
}
