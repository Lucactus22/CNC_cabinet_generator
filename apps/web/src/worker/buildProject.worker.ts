import { buildProject, type ProjectParams, type ProjectResult } from '@cabgen/core';

/**
 * `self` resolves to `Window` under the project's DOM lib config, whose
 * `postMessage` needs a target origin. Casting to the shape this worker
 * actually has sidesteps pulling in `lib.webworker.d.ts`, which redeclares
 * globals like `self` and would collide with `lib.dom.d.ts` across the rest
 * of the app's single tsconfig program.
 */
type BuildProjectWorkerScope = {
  onmessage: ((event: MessageEvent<ProjectParams>) => void) | null;
  postMessage(project: ProjectResult): void;
};

const ctx = self as unknown as BuildProjectWorkerScope;

ctx.onmessage = (event) => {
  ctx.postMessage(buildProject(event.data));
};
