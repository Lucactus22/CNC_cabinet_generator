import { create } from 'zustand';
import { buildProject, defaultParams, type ProjectParams, type ProjectResult } from '@cabgen/core';

export type ViewTab = '3d' | 'sheets' | 'parts';

interface AppState {
  params: ProjectParams;
  project: ProjectResult;
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

/**
 * Rebuilding the whole project on every keystroke is deliberate: the pipeline
 * is pure and takes a couple of milliseconds, so the previews and the
 * diagnostics can never disagree with the parameters.
 */
export const useStore = create<AppState>((set, get) => {
  const initial = defaultParams();
  return {
    params: initial,
    project: buildProject(initial),
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
      set({ params, project: buildProject(params), ...settled(params, get().selectedCabinetId) });
    },
    reset: () => {
      const params = defaultParams();
      set({
        params,
        project: buildProject(params),
        selectedPartId: null,
        ...settled(params, ''),
      });
    },
    load: (params) =>
      set({ params, project: buildProject(params), selectedPartId: null, ...settled(params, '') }),
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
