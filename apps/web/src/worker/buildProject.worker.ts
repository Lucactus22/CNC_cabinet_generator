import { buildProject, type ProjectParams, type ProjectResult } from '@cabgen/core';

/** What a caller sent, and the label it wants back with the answer. */
export interface BuildRequest {
  params: ProjectParams;
  tag: string | null;
}

export interface BuildReply {
  project: ProjectResult;
  tag: string | null;
}

/**
 * `self` resolves to `Window` under the project's DOM lib config, whose
 * `postMessage` needs a target origin. Casting to the shape this worker
 * actually has sidesteps pulling in `lib.webworker.d.ts`, which redeclares
 * globals like `self` and would collide with `lib.dom.d.ts` across the rest
 * of the app's single tsconfig program.
 */
type BuildProjectWorkerScope = {
  onmessage: ((event: MessageEvent<BuildRequest>) => void) | null;
  postMessage(reply: BuildReply): void;
};

const ctx = self as unknown as BuildProjectWorkerScope;

ctx.onmessage = (event) => {
  ctx.postMessage({ project: buildProject(event.data.params), tag: event.data.tag });
};
