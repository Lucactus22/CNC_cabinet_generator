import { useMemo, useState } from 'react';
import type { Feature, Part } from '@cabgen/core';
import { useStore } from '../store';
import { useGoTo } from '../navigate';
import { Thumbnail } from '../gallery/Thumbnail';
import { machiningOf, sectionThrough } from '../explain/features';
import type { ExplainContext, Topic } from '../explain/topics';

/**
 * Why there is a groove there.
 *
 * Selecting a panel already says what it is. What it never said is why it has
 * a groove across it, why the groove stops short of the front, or why there is
 * a bite out of one corner — and for somebody who has not read
 * docs/JOINERY.md, those are the questions actually being asked while looking
 * at it. R-19's answer: a list of what is machined into this blank, and a
 * section through **their own cabinet** at whichever one they pick.
 *
 * The picture is the section renderer R-18 built, pointed at the live project
 * rather than a sample, so it is a cut through the joint that is about to be
 * cut in their plywood.
 */
export function Machining({ part }: { part: Part }) {
  const groups = useMemo(() => machiningOf(part), [part]);
  const [openPurpose, setOpenPurpose] = useState<string | null>(null);

  if (groups.length === 0) {
    return (
      <p className="hint">
        Nothing is machined into this blank: it is cut to shape and that is all.
      </p>
    );
  }

  return (
    <div className="machining">
      {groups.map((group) => {
        const open = openPurpose === group.purpose;
        return (
          <div key={group.purpose} className={open ? 'machining-item open' : 'machining-item'}>
            <button
              type="button"
              className="machining-head"
              aria-expanded={open}
              onClick={() => setOpenPurpose(open ? null : group.purpose)}
            >
              <b>{group.label}</b>
              <span>
                {group.features.length} × {kindOf(group.features[0]!)}
              </span>
            </button>
            {open && (
              <FeatureExplanation part={part} feature={group.features[0]!} topic={group.topic} />
            )}
          </div>
        );
      })}
      <p className="hint">
        Every cut on this blank, grouped by what put it there. The picture is a section through your
        own cabinet at that joint, not an illustration of one.
      </p>
    </div>
  );
}

const kindOf = (feature: Feature): string =>
  feature.kind === 'pocket'
    ? 'pocket'
    : feature.kind === 'through'
      ? 'cut right through'
      : feature.kind === 'drill'
        ? 'hole'
        : 'engraving';

function FeatureExplanation({
  part,
  feature,
  topic,
}: {
  part: Part;
  feature: Feature;
  topic?: Topic;
}) {
  const project = useStore((s) => s.project);
  const params = useStore((s) => s.params);
  // The view is memoised because it is the cache key the thumbnail draws
  // against: a fresh object every render would re-section the whole assembly
  // on every keystroke elsewhere in the app.
  const view = useMemo(() => sectionThrough(project, part, feature), [project, part, feature]);

  return (
    <div className="explain">
      {view && (
        <span className="explain-pic">
          <Thumbnail project={project} view={view} />
        </span>
      )}
      {topic ? (
        <TopicBody topic={topic} ctx={{ params, project, part, feature }} />
      ) : (
        <p className="hint">
          Machined by this generator, and not yet written up. If you are reading this, the joint is
          newer than its explanation.
        </p>
      )}
    </div>
  );
}

/**
 * One capability, said out loud.
 *
 * The two sentences come from `explain/topics.ts`, where each one is bound to
 * a heading in `docs/` that a test checks it against; the numbers are read off
 * the live project rather than typed, so a sentence about a hinge cup follows
 * the hinge this project is actually cut for.
 */
export function TopicBody({ topic, ctx }: { topic: Topic; ctx: ExplainContext }) {
  const { toParam } = useGoTo();
  const measures = topic.measures?.(ctx) ?? [];

  return (
    <div className="topic-body">
      <p className="topic-what">{topic.what}</p>
      <p className="topic-why">{topic.why}</p>
      {measures.length > 0 && (
        <dl className="topic-measures">
          {measures.map((m) => (
            <div key={m.label}>
              <dt>{m.label}</dt>
              <dd>{m.value}</dd>
            </div>
          ))}
        </dl>
      )}
      <p className="topic-source">
        {topic.param && (
          <button className="link" onClick={() => toParam(topic.param!)}>
            Where this is set
          </button>
        )}
        <span className="cite">
          docs/{topic.source.doc} › {topic.source.heading}
        </span>
      </p>
    </div>
  );
}
