import type { ProjectParams } from '@cabgen/core';
import { useStore } from '../store';
import { applyWorkshop, workshopOf } from '../workshop';
import { cachedBuild } from './samples';
import { Thumbnail } from './Thumbnail';
import { STARTERS, type Starter } from './starters';
import { topicById } from '../explain/topics';
import type { View } from './render';

/**
 * Pick a cabinet, not a set of defaults.
 *
 * Every tile is a render of the project the button loads, built by the real
 * pipeline on the workshop settings already in this browser — so the picture
 * is of *your* sheets and *your* cutter, and it cannot drift from what lands
 * when you press it.
 */
const STARTER_VIEW: View = { kind: 'iso', azimuth: 30, elevation: 18 };

/** A starter as it would actually land: its furniture, this shop's machine. */
export function starterParams(live: ProjectParams, starter: Starter): ProjectParams {
  const design = starter.build();
  applyWorkshop(design, workshopOf(live));
  return design;
}

export function StarterGallery() {
  const params = useStore((s) => s.params);
  const startFrom = useStore((s) => s.startFrom);
  const close = useStore((s) => s.setStartersOpen);
  const setShowroom = useStore((s) => s.setShowroom);

  return (
    <div className="scrim" onClick={() => close(false)} role="presentation">
      <section
        className="starters"
        aria-label="Start from a design"
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          <h2>Start from something that already works</h2>
          <button className="crumb dismiss" aria-label="Close" onClick={() => close(false)}>
            ✕
          </button>
        </header>
        <p className="hint">
          Each of these loads complete and cuttable, on the machine and the sheets this browser
          already knows about. Taking one apart is a faster way to find out what this tool can make
          than reading about it — and each one says underneath what it is there to show you.{' '}
          <button
            className="link"
            onClick={() => {
              close(false);
              setShowroom({ topicId: null });
            }}
          >
            Or see everything it can make.
          </button>
        </p>
        <div className="starter-grid">
          {STARTERS.map((starter) => {
            const design = starterParams(params, starter);
            const project = cachedBuild(design);
            return (
              <button
                key={starter.id}
                type="button"
                className="starter"
                onClick={() => {
                  startFrom(design);
                  close(false);
                }}
              >
                <Thumbnail project={project} view={STARTER_VIEW} className="starter-pic" />
                <b>{starter.name}</b>
                <span>{starter.about}</span>
                <span className="demonstrates">
                  {starter.demonstrates.map((id) => (
                    <i key={id}>{topicById(id)?.title ?? id}</i>
                  ))}
                </span>
                <em>
                  {project.parts.length} parts · {project.nest.sheets.length} sheets
                </em>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
