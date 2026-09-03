import { buildProject, type ProjectParams, type ProjectResult } from '@cabgen/core';

/** What a caller sent, and the label it wants back with the answer. */
export interface BuildRequest {
  params: ProjectParams;
  tag: string | null;
}

/**
 * A finished build, or the reason there is not one.
 *
 * Every request gets exactly one reply. A throw that posted nothing would
 * leave the client believing a build was still running for the rest of the
 * session: the top bar stuck on *updating…*, export refused, and no
 * diagnostic anywhere — the app quietly claiming to be busy forever.
 */
export type BuildReply =
  | { project: ProjectResult; error?: undefined; tag: string | null }
  | { project?: undefined; error: string; tag: string | null };

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
  const { params, tag } = event.data;
  try {
    ctx.postMessage({ project: buildProject(params), tag });
  } catch (e) {
    ctx.postMessage({ error: e instanceof Error ? e.message : String(e), tag });
  }
};
