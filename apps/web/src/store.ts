import { create } from 'zustand';
import {
  buildProject,
  defaultParams,
  type CabinetParams,
  type ProjectResult,
} from '@cabgen/core';

export type ViewTab = '3d' | 'sheets' | 'parts';

interface AppState {
  params: CabinetParams;
  project: ProjectResult;
  tab: ViewTab;
  selectedPartId: string | null;
  exploded: number;
  setTab: (tab: ViewTab) => void;
  select: (partId: string | null) => void;
  setExploded: (v: number) => void;
  /** Apply a change to the parameters and rebuild. */
  update: (fn: (draft: CabinetParams) => void) => void;
  reset: () => void;
  load: (params: CabinetParams) => void;
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
    exploded: 0,
    setTab: (tab) => set({ tab }),
    select: (selectedPartId) => set({ selectedPartId }),
    setExploded: (exploded) => set({ exploded }),
    update: (fn) => {
      const params = structuredClone(get().params);
      fn(params);
      set({ params, project: buildProject(params) });
    },
    reset: () => {
      const params = defaultParams();
      set({ params, project: buildProject(params), selectedPartId: null });
    },
    load: (params) => set({ params, project: buildProject(params), selectedPartId: null }),
  };
});

export const severityRank = { error: 0, warning: 1, info: 2 } as const;
