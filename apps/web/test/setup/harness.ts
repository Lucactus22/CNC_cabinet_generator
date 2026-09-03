import { waitFor } from '@testing-library/react';
import { buildProject, defaultParams, type ProjectParams } from '@cabgen/core';
import { useStore } from '../../src/store';
import { RUN } from '../../src/selection';
import { emptyMachineProgress } from '../../src/machineProgress';
import { offeredFixes } from '../../src/fixes';

/**
 * The store back to a known project, between tests that share it.
 *
 * `useStore` is a module singleton — the app has exactly one design open at a
 * time, and making it constructible per test would be production code shaped
 * by a test. So each test states the project it starts from instead, and
 * anything a previous test opened, saved, undid or left selected is cleared
 * here rather than leaking into the next one.
 */
export async function resetStore(params: ProjectParams = defaultParams()): Promise<void> {
  // Through the app's own "open this project" path rather than straight into
  // the state, because that is what ends an edit burst. The 500 ms window
  // that collapses a drag into one undo step is held in a closure, not in the
  // state, so a test that wrote `params` directly would inherit the previous
  // test's open burst and see its own first edit push no undo baseline.
  useStore.getState().load(params);
  await settled();
  useStore.setState({
    params,
    project: buildProject(params),
    building: false,
    surface: 'bench',
    workshopOpen: false,
    paletteOpen: false,
    diagnosticsOpen: false,
    startersOpen: false,
    exportPreviewOpen: false,
    atMachine: false,
    showroom: null,
    selection: RUN,
    section: null,
    focusParam: null,
    safeNames: false,
    exploded: 0,
    past: [],
    future: [],
    library: [],
    profiles: [],
    workshopNotes: [],
    preview: null,
    // Not reset and the next test starts with a part already ticked as cut,
    // because the record is keyed on the cut list's own fingerprint and the
    // default project's is the same one it was written against.
    machineProgress: emptyMachineProgress(),
  });
}

/**
 * Wait for the build a change asked for to land.
 *
 * Every parameter edit goes to a worker and the result arrives a turn later
 * (R-12), so an assertion made immediately after an edit is being made
 * against the *previous* project. That is not a test artefact — it is the
 * state the app genuinely passes through, and `building` is the flag it uses
 * to refuse to export during it.
 */
export async function settled(): Promise<void> {
  await waitFor(() => {
    if (useStore.getState().building) throw new Error('still building');
  });
}

/**
 * A project that can actually be exported, reached the way the app offers.
 *
 * A fresh project cannot be cut — its 2440 mm sheets are wider than the axis
 * of a 1 m machine that never moves — and docs/UX.md measured getting out of
 * that as J6's whole difficulty. Rather than hand-writing sheet sizes that
 * happen to work, this presses the app's own first offered fix, so a test
 * that needs an exportable project is also standing on the route a user
 * takes. A fix that stopped clearing the errors would fail here loudly
 * instead of leaving every test downstream quietly testing a blocked app.
 */
export function exportableParams(): ProjectParams {
  const params = defaultParams();
  const fix = offeredFixes(params, buildProject(params))[0];
  if (!fix) throw new Error('the app offers no fix for a fresh project');
  const next = structuredClone(params);
  fix.apply(next);
  return next;
}
