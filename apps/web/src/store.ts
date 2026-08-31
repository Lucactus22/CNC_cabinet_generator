import { create } from 'zustand';
import { buildProject, defaultParams, type ProjectParams, type ProjectResult } from '@cabgen/core';
import { createProjectWorkerClient } from './worker/projectWorkerClient';
import {
  loadAutosave,
  loadLibrary,
  loadProfiles,
  saveAutosave,
  saveLibrary,
  saveProfiles,
  type LibraryEntry,
} from './persistence';
import { RUN, settleSelection, type Selection } from './selection';
import { applyWorkshop, workshopOf, type WorkshopProfile } from './workshop';

/**
 * Two surfaces, split by whether you are standing at the machine: the bench is
 * everything you touch while designing, the output pack is everything you
 * print or read with a panel in your hands. See docs/UX.md, question 4.
 */
export type Surface = 'bench' | 'output';

interface AppState {
  params: ProjectParams;
  project: ProjectResult;
  /** True from the moment `params` changes until the worker's rebuild for it lands. */
  building: boolean;
  surface: Surface;
  /** The workshop settings, open over whichever surface is showing. */
  workshopOpen: boolean;
  paletteOpen: boolean;
  diagnosticsOpen: boolean;
  /** What the inspector is pointed at. Always resolves; see selection.ts. */
  selection: Selection;
  /** Set by the command palette so the control it found can scroll itself in and take focus. */
  focusParam: string | null;
  /**
   * Write POCKET_D6P35 instead of POCKET_D6.35, for importers that dislike
   * dots. On the store rather than beside the checkbox because export can be
   * started from two places, and a toggle only one of them reads is a file
   * written to a setting nobody chose.
   */
  safeNames: boolean;
  exploded: number;
  /** Parameter sets an `undo` would step back to, oldest first. */
  past: ProjectParams[];
  /** Parameter sets a `redo` would step forward to, nearest first. */
  future: ProjectParams[];
  /** Designs saved to this browser under a name, so they can be reopened later. */
  library: LibraryEntry[];
  /** Workshops saved to this browser, applied to a project as an undoable update. */
  profiles: WorkshopProfile[];
  /** What applying a profile had to repoint, shown once and dismissed. */
  workshopNotes: string[];
  setSurface: (surface: Surface) => void;
  setWorkshopOpen: (open: boolean) => void;
  setPaletteOpen: (open: boolean) => void;
  setSafeNames: (v: boolean) => void;
  setDiagnosticsOpen: (open: boolean) => void;
  select: (selection: Selection) => void;
  /** Show a parameter: switch to wherever it lives and focus it. */
  reveal: (opts: {
    surface?: Surface;
    workshop?: boolean;
    selection?: Selection;
    param?: string;
  }) => void;
  clearFocusParam: () => void;
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
  saveWorkshop: (name: string) => void;
  applyProfile: (id: string) => void;
  deleteProfile: (id: string) => void;
  dismissWorkshopNotes: () => void;
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
/** Long enough for the control to mount and mark itself, short enough not to linger. */
const FOCUS_TIMEOUT_MS = 2000;

function makeId(): string {
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

  worker.subscribe((project) =>
    set((s) => ({
      project,
      building: worker.isBusy(),
      // A part that has stopped existing cannot stay selected: the inspector
      // would be describing a panel that is no longer cut. Settled against the
      // *current* parameters rather than the ones this build came from — a
      // build lands behind what is on screen, and settling a just-created bay
      // away because the build predates it would take the selection off what
      // the user is looking at.
      selection: settleSelection(s.params, project.parts, s.selection),
    })),
  );

  const rebuild = (params: ProjectParams) => {
    set({ building: true });
    worker.request(params);
  };

  let focusTimer: ReturnType<typeof setTimeout> | null = null;
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
  const jumpTo = (params: ProjectParams, keep: Selection) => {
    endBurst();
    const prev = get().params;
    set((s) => ({
      past: [...s.past, prev],
      future: [],
      params,
      selection: settleSelection(params, s.project.parts, keep),
    }));
    rebuild(params);
    scheduleAutosave(params);
  };

  return {
    params: initial,
    project: buildProject(initial),
    building: false,
    surface: 'bench',
    workshopOpen: false,
    paletteOpen: false,
    diagnosticsOpen: false,
    selection: RUN,
    focusParam: null,
    safeNames: false,
    exploded: 0,
    past: [],
    future: [],
    library: loadLibrary(),
    profiles: loadProfiles(),
    workshopNotes: [],
    setSurface: (surface) => set({ surface }),
    setWorkshopOpen: (workshopOpen) => set({ workshopOpen }),
    setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
    setSafeNames: (safeNames) => set({ safeNames }),
    setDiagnosticsOpen: (diagnosticsOpen) => set({ diagnosticsOpen }),
    // Deliberately leaves the surface alone: picking a part out of the cut
    // list is how you look at its drawing, and being thrown back to the bench
    // for it would make the table unusable. Anything that does want to change
    // surface says so through `reveal`.
    select: (selection) =>
      set((s) => ({ selection: settleSelection(s.params, s.project.parts, selection) })),
    reveal: ({ surface, workshop, selection, param }) => {
      // Cleared on a timer as well as by whichever control claims it: a
      // conditionally rendered parameter — the reveal that is only shown for
      // an overlay door, say — never mounts to claim it, and a stale one
      // would grab the scroll and the focus off the next control that did.
      if (focusTimer !== null) clearTimeout(focusTimer);
      focusTimer = setTimeout(() => {
        focusTimer = null;
        set({ focusParam: null });
      }, FOCUS_TIMEOUT_MS);
      set((s) => ({
        surface: surface ?? s.surface,
        workshopOpen: workshop ?? false,
        paletteOpen: false,
        diagnosticsOpen: false,
        selection: selection ? settleSelection(s.params, s.project.parts, selection) : s.selection,
        focusParam: param ?? null,
      }));
    },
    clearFocusParam: () => {
      if (focusTimer !== null) clearTimeout(focusTimer);
      focusTimer = null;
      set({ focusParam: null });
    },
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
        selection: settleSelection(params, s.project.parts, s.selection),
      }));
      rebuild(params);
      scheduleAutosave(params);
    },
    reset: () => jumpTo(defaultParams(), RUN),
    load: (params) => jumpTo(params, RUN),
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
        selection: settleSelection(previous, s.project.parts, s.selection),
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
        selection: settleSelection(next, s.project.parts, s.selection),
      }));
      rebuild(next);
      scheduleAutosave(next);
    },
    saveToLibrary: (name) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      const entry: LibraryEntry = {
        id: makeId(),
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
      jumpTo(entry.params, RUN);
    },
    deleteFromLibrary: (id) => {
      const library = get().library.filter((e) => e.id !== id);
      set({ library });
      saveLibrary(library);
    },
    saveWorkshop: (name) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      const profile: WorkshopProfile = {
        id: makeId(),
        name: trimmed,
        savedAt: new Date().toISOString(),
        settings: workshopOf(get().params),
      };
      const profiles = [...get().profiles, profile];
      set({ profiles });
      saveProfiles(profiles);
    },
    // Loud and undoable: the profile's numbers are copied into this project,
    // and anything the copy had to repoint is reported rather than absorbed.
    applyProfile: (id) => {
      const profile = get().profiles.find((p) => p.id === id);
      if (!profile) return;
      let notes: string[] = [];
      get().update((p) => {
        notes = applyWorkshop(p, profile.settings);
      });
      set({
        workshopNotes: [`Applied the "${profile.name}" workshop. Undo puts it back.`, ...notes],
      });
    },
    deleteProfile: (id) => {
      const profiles = get().profiles.filter((p) => p.id !== id);
      set({ profiles });
      saveProfiles(profiles);
    },
    dismissWorkshopNotes: () => set({ workshopNotes: [] }),
  };
});

export const severityRank = { error: 0, warning: 1, info: 2 } as const;

/** The part the inspector, the sheet view and the 3D view all highlight. */
export const selectedPartId = (s: { selection: Selection }): string | null =>
  s.selection.kind === 'part' ? s.selection.partId : null;
