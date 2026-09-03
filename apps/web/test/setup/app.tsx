/**
 * Rendering one panel of the bench, against the real store and the real
 * pipeline.
 *
 * The store is a module singleton created once per test *file* — it opens two
 * workers and reads `localStorage` at import time — so isolation between tests
 * is `resetStore()` putting it back to what a fresh browser sees, not a new
 * store. That is deliberate: a second store would be a copy of the thing under
 * test, and the failures worth catching here (a control writing the wrong
 * parameter, a selection that stops resolving) all live in the one the app
 * actually uses.
 */
import { act, cleanup, render, type RenderResult } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';
import { buildProject, defaultParams, type ProjectParams } from '@cabgen/core';
import type { ReactElement } from 'react';
import { emptyMachineProgress } from '../../src/machineProgress';
import { RUN } from '../../src/selection';
import { useStore } from '../../src/store';

/**
 * Back to a fresh browser: the shipped default, no history, nothing open, and
 * an empty `localStorage` so an autosave written by the test before this one
 * cannot decide what this one opens on.
 */
export function resetStore(params: ProjectParams = defaultParams()): void {
  localStorage.clear();
  // Through `load` rather than straight into `setState`, because `update`
  // coalesces edits made within half a second of each other into one undo
  // step and that window is wall clock, not per test. Every path that swaps
  // the parameters wholesale — Open, Reset, undo — closes the burst; without
  // one here, a test that edits within 500 ms of the test before it inherits
  // that burst, pushes no baseline of its own, and finds Undo does nothing.
  useStore.getState().load(params);
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
    machineProgress: emptyMachineProgress(),
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
  });
}

/**
 * Let every rebuild the last act asked for finish and land on the store.
 *
 * Two turns of the loop rather than one: the worker client resends a coalesced
 * request *before* notifying its listener, so a burst of edits takes more than
 * one round trip to settle even in process.
 */
export async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** Render a panel with the store already reset, and clean up after the test. */
export function renderPanel(ui: ReactElement): RenderResult {
  return render(ui);
}

/** Change the store from a test the way a click would: inside `act`. */
export async function change(fn: () => void): Promise<void> {
  await act(async () => {
    fn();
  });
  await settle();
}

beforeEach(() => resetStore());
afterEach(() => cleanup());

/**
 * Every leaf of a parameter set, as a dotted path with array indices collapsed
 * to `[]` — the same shape `catalog.ts` writes a control's `param` in.
 */
export function leafPaths(value: unknown, prefix = ''): Map<string, unknown> {
  const out = new Map<string, unknown>();
  if (Array.isArray(value)) {
    value.forEach((item, i) => {
      for (const [k, v] of leafPaths(item, `${prefix}[${i}]`)) out.set(k, v);
    });
    if (value.length === 0) out.set(prefix, '[]');
    return out;
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      const path = prefix ? `${prefix}.${key}` : key;
      for (const [k, v] of leafPaths(item, path)) out.set(k, v);
    }
    return out;
  }
  out.set(prefix, value);
  return out;
}

/** Which leaves differ between two parameter sets, indices collapsed to `[]`. */
export function changedPaths(before: ProjectParams, after: ProjectParams): string[] {
  const a = leafPaths(before);
  const b = leafPaths(after);
  const moved = new Set<string>();
  for (const [path, value] of b) {
    if (!a.has(path) || a.get(path) !== value) moved.add(generalise(path));
  }
  for (const path of a.keys()) {
    if (!b.has(path)) moved.add(generalise(path));
  }
  return [...moved].sort();
}

const generalise = (path: string): string => path.replace(/\[\d+\]/g, '[]');
