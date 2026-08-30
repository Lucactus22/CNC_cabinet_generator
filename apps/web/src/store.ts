import { create } from 'zustand';
import { buildProject, defaultParams, type ProjectParams, type ProjectResult } from '@cabgen/core';
import { createProjectWorkerClient } from './worker/projectWorkerClient';

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
  setTab: (tab: ViewTab) => void;
  select: (partId: string | null) => void;
  selectCabinet: (cabinetId: string) => void;
  setExploded: (v: number) => void;
  /** Apply a change to the parameters and rebuild. */
  update: (fn: (draft: ProjectParams) => void) => void;
  reset: () => void;
  load: (params: ProjectParams) => void;
}

const worker = createProjectWorkerClient();

/**
 * `buildProject` runs in a worker (R-12) so a fifteen-cabinet kitchen never
 * blocks typing: `params` updates immediately, and `project` — the last
 * build that finished — is left on screen until the worker's next one lands.
 * The worker client itself coalesces a burst of rapid changes to whichever
 * params were current when it last finished, so the preview always catches
 * up rather than working through every value a slider passed on the way.
 */
export const useStore = create<AppState>((set, get) => {
  const initial = defaultParams();

  worker.subscribe((project) => set({ project, building: worker.isBusy() }));

  const rebuild = (params: ProjectParams) => {
    set({ building: true });
    worker.request(params);
  };

  return {
    params: initial,
    project: buildProject(initial),
    building: false,
    tab: '3d',
    selectedPartId: null,
    selectedCabinetId: initial.cabinets[0]?.id ?? '',
    exploded: 0,
    setTab: (tab) => set({ tab }),
    select: (selectedPartId) => set({ selectedPartId }),
    selectCabinet: (selectedCabinetId) => set({ selectedCabinetId }),
    setExploded: (exploded) => set({ exploded }),
    update: (fn) => {
      const params = structuredClone(get().params);
      fn(params);
      set({ params, ...settled(params, get().selectedCabinetId) });
      rebuild(params);
    },
    reset: () => {
      const params = defaultParams();
      set({ params, selectedPartId: null, ...settled(params, '') });
      rebuild(params);
    },
    load: (params) => {
      set({ params, selectedPartId: null, ...settled(params, '') });
      rebuild(params);
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
