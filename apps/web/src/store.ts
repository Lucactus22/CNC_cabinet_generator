import { create } from 'zustand';
import { buildProject, defaultParams, type ProjectParams, type ProjectResult } from '@cabgen/core';
import { createProjectWorkerClient } from './worker/projectWorkerClient';
import {
  loadAutosave,
  loadLibrary,
  saveAutosave,
  saveLibrary,
  type LibraryEntry,
} from './persistence';

export type ViewTab = '3d' | 'sheets' | 'parts' | 'guide';

interface AppState {
  params: ProjectParams;
  project: ProjectResult;
  /** True from the moment `params` changes until the worker's rebuild for it lands. */
  building: boolean;
  tab: ViewTab;
  selectedPartId: string | null;
  /** Which cabinet in the run the parameter panel is editing. */
  selectedCabinetId: string;
  exploded: number;
  /** Parameter sets an `undo` would step back to, oldest first. */
  past: ProjectParams[];
  /** Parameter sets a `redo` would step forward to, nearest first. */
  future: ProjectParams[];
  /** Designs saved to this browser under a name, so they can be reopened later. */
  library: LibraryEntry[];
  setTab: (tab: ViewTab) => void;
  select: (partId: string | null) => void;
  selectCabinet: (cabinetId: string) => void;
  setExploded: (v: number) => void;
  /** Apply a change to the parameters and rebuild. */
  update: (fn: (draft: ProjectParams) => void) => void;
  reset: () => void;
  load: (params: ProjectParams) => void;
  undo: () => void;
  redo: () => void;
  saveToLibrary: (name: string) => void;
  loadFromLibrary: (id: string) => void;
  deleteFromLibrary: (id: string) => void;
}

const worker = createProjectWorkerClient();

// A stray click on Reset losing an hour of work is the exact failure this
// history exists to prevent, so every path that changes `params` — typing,
// undo/redo itself, Reset, Open — pushes onto it, not just `update`. Fast
// edits (dragging a field, typing a number) still coalesce into one undo
// step rather than one per keystroke: `update` pushes the state a burst
// started from onto `past` immediately, on its *first* call, so the button
// and the keyboard shortcut are never out of sync with what Ctrl+Z would
// actually do; a later call within HISTORY_DEBOUNCE_MS of the last one is
// read as continuing that same burst and pushes nothing further.
const HISTORY_DEBOUNCE_MS = 500;
const AUTOSAVE_DEBOUNCE_MS = 500;

function makeLibraryId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * `buildProject` runs in a worker (R-12) so a fifteen-cabinet kitchen never
 * blocks typing: `params` updates immediately, and `project` — the last
 * build that finished — is left on screen until the worker's next one lands.
 * The worker client itself coalesces a burst of rapid changes to whichever
 * params were current when it last finished, so the preview always catches
 * up rather than working through every value a slider passed on the way.
 */
export const useStore = create<AppState>((set, get) => {
  const initial = loadAutosave() ?? defaultParams();

  worker.subscribe((project) => set({ project, building: worker.isBusy() }));

  const rebuild = (params: ProjectParams) => {
    set({ building: true });
    worker.request(params);
  };

  let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
  const scheduleAutosave = (params: ProjectParams) => {
    if (autosaveTimer !== null) clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => {
      autosaveTimer = null;
      saveAutosave(params);
    }, AUTOSAVE_DEBOUNCE_MS);
  };
  // A debounced write that never fires before the tab closes is a promise
  // broken silently — the one thing autosave exists to prevent — so a real
  // exit flushes whatever is still pending immediately instead of waiting
  // out the debounce. `visibilitychange` catches a closed tab or a switch to
  // another app on mobile, where `pagehide` and `beforeunload` are not
  // reliably fired at all; `pagehide` also catches a same-tab navigation.
  const flushAutosave = () => {
    if (autosaveTimer === null) return;
    clearTimeout(autosaveTimer);
    autosaveTimer = null;
    saveAutosave(get().params);
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushAutosave();
  });
  window.addEventListener('pagehide', flushAutosave);

  // Whether the most recent `update()` call is still within the same burst
  // as the one before it — see the note above HISTORY_DEBOUNCE_MS. Anything
  // that changes `params` outside `update` (undo, redo, jumpTo) ends the
  // burst, so the next keystroke is never mistaken for continuing one whose
  // baseline it did not push.
  let burstOpen = false;
  let lastEditAt = 0;
  const endBurst = () => {
    burstOpen = false;
  };

  /** Every path that swaps `params` wholesale — undo, redo, Reset, Open. */
  const jumpTo = (params: ProjectParams, wantedCabinetId: string) => {
    endBurst();
    const prev = get().params;
    set((s) => ({
      past: [...s.past, prev],
      future: [],
      params,
      selectedPartId: null,
      ...settled(params, wantedCabinetId),
    }));
    rebuild(params);
    scheduleAutosave(params);
  };

  return {
    params: initial,
    project: buildProject(initial),
    building: false,
    tab: '3d',
    selectedPartId: null,
    selectedCabinetId: initial.cabinets[0]?.id ?? '',
    exploded: 0,
    past: [],
    future: [],
    library: loadLibrary(),
    setTab: (tab) => set({ tab }),
    select: (selectedPartId) => set({ selectedPartId }),
    selectCabinet: (selectedCabinetId) => set({ selectedCabinetId }),
    setExploded: (exploded) => set({ exploded }),
    update: (fn) => {
      const prevParams = get().params;
      const now = Date.now();
      const continuingBurst = burstOpen && now - lastEditAt < HISTORY_DEBOUNCE_MS;
      burstOpen = true;
      lastEditAt = now;

      const params = structuredClone(prevParams);
      fn(params);
      set((s) => ({
        // Only the first call of a burst pushes a baseline; a call that
        // continues one reuses `s.past`'s own reference rather than a new
        // array holding the same entries, so it does not also wake every
        // component reading `past` on every keystroke of a drag.
        past: continuingBurst ? s.past : [...s.past, prevParams],
        params,
        // A fresh edit invalidates whatever `undo` had stepped back from —
        // redoing into a branch that no longer follows from `params` would
        // silently reapply a change the user has since typed over.
        future: s.future.length > 0 ? [] : s.future,
        ...settled(params, s.selectedCabinetId),
      }));
      rebuild(params);
      scheduleAutosave(params);
    },
    reset: () => jumpTo(defaultParams(), ''),
    load: (params) => jumpTo(params, ''),
    undo: () => {
      endBurst();
      const { past } = get();
      const previous = past.at(-1);
      if (previous === undefined) return;
      const params = get().params;
      set((s) => ({
        past: s.past.slice(0, -1),
        future: [params, ...s.future],
        params: previous,
        selectedPartId: null,
        ...settled(previous, s.selectedCabinetId),
      }));
      rebuild(previous);
      scheduleAutosave(previous);
    },
    redo: () => {
      endBurst();
      const { future } = get();
      const next = future[0];
      if (next === undefined) return;
      const params = get().params;
      set((s) => ({
        future: s.future.slice(1),
        past: [...s.past, params],
        params: next,
        selectedPartId: null,
        ...settled(next, s.selectedCabinetId),
      }));
      rebuild(next);
      scheduleAutosave(next);
    },
    saveToLibrary: (name) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      const entry: LibraryEntry = {
        id: makeLibraryId(),
        name: trimmed,
        savedAt: new Date().toISOString(),
        params: get().params,
      };
      const library = [...get().library, entry];
      set({ library });
      saveLibrary(library);
    },
    loadFromLibrary: (id) => {
      const entry = get().library.find((e) => e.id === id);
      if (!entry) return;
      jumpTo(entry.params, '');
    },
    deleteFromLibrary: (id) => {
      const library = get().library.filter((e) => e.id !== id);
      set({ library });
      saveLibrary(library);
    },
  };
});

/**
 * Keep the panel pointed at a cabinet that still exists.
 *
 * Removing the selected cabinet, or opening a different project, would
 * otherwise leave the panel editing an id nothing answers to and the whole
 * sidebar blank.
 */
function settled(params: ProjectParams, wanted: string): { selectedCabinetId: string } {
  const stillThere = params.cabinets.some((c) => c.id === wanted);
  return { selectedCabinetId: stillThere ? wanted : (params.cabinets[0]?.id ?? '') };
}

export const severityRank = { error: 0, warning: 1, info: 2 } as const;
