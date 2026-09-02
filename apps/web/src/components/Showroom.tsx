import { useEffect, useRef } from 'react';
import { useStore } from '../store';
import { sampleProject } from '../gallery/samples';
import { Thumbnail } from '../gallery/Thumbnail';
import { GROUP_LABEL, GROUP_ORDER, TOPICS, type Topic } from '../explain/topics';
import { TopicBody } from './Explain';
import { useDialog } from './overlays';

/**
 * The showroom: what this tool can make.
 *
 * Not a manual and not a tour. It is one place that shows every joint, every
 * panel style, every kind of front and every surface this generator can cut —
 * each one rendered by the real pipeline, on this browser's own sheets and
 * cutter — so somebody who does not have the word for a thing can still find
 * it by looking. R-16's discovery audit is the list it works from: fifteen of
 * those capabilities are inside sections that render nothing until opened, and
 * nothing anywhere in the interface says they exist.
 *
 * It changes nothing. Browsing it cannot alter the design, which is what makes
 * it safe to open in the middle of a job — every tile's only action is to take
 * you to where that thing is set, if it is set anywhere.
 */
export function Showroom() {
  const dialog = useDialog<HTMLElement>();
  const showroom = useStore((s) => s.showroom);
  const setShowroom = useStore((s) => s.setShowroom);
  const wanted = showroom?.topicId ?? null;
  const target = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (wanted) target.current?.scrollIntoView({ block: 'center' });
  }, [wanted]);

  return (
    <div className="scrim" onClick={() => setShowroom(null)} role="presentation">
      <section
        className="showroom"
        ref={dialog}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="What this can make"
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          <h2>What this can make</h2>
          <button className="crumb dismiss" aria-label="Close" onClick={() => setShowroom(null)}>
            ✕
          </button>
        </header>
        <p className="hint">
          Every picture here is cut by the same code that cuts your project, on the sheets and the
          cutter this browser already knows about. Nothing in here changes your design.
        </p>
        {GROUP_ORDER.map((group) => {
          const topics = TOPICS.filter((t) => t.group === group);
          if (topics.length === 0) return null;
          return (
            <section key={group} className="showroom-group">
              <h3>{GROUP_LABEL[group]}</h3>
              <div className="showroom-grid">
                {topics.map((topic) => (
                  <div
                    key={topic.id}
                    className={topic.id === wanted ? 'showcase wanted' : 'showcase'}
                    ref={topic.id === wanted ? target : undefined}
                  >
                    <ShowroomTile topic={topic} />
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </section>
    </div>
  );
}

function ShowroomTile({ topic }: { topic: Topic }) {
  const params = useStore((s) => s.params);
  const project = useStore((s) => s.project);
  const picture = topic.picture;

  return (
    <>
      <h4>{topic.title}</h4>
      {picture ? (
        <span className="showcase-pic">
          <Thumbnail project={sampleProject(params, picture.seed)} view={picture.view} />
        </span>
      ) : (
        // Deliberately not a picture, and it says which deliberate reason:
        // some of what this tool does is two millimetres off a blank, and a
        // tile that looked like the thing it is not would teach the opposite
        // of the truth.
        <span className="showcase-pic none">{topic.insteadOfAPicture}</span>
      )}
      <TopicBody topic={topic} ctx={{ params, project }} />
    </>
  );
}
