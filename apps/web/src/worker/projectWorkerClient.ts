import type { ProjectParams, ProjectResult } from '@cabgen/core';
import type { BuildReply, BuildRequest } from './buildProject.worker';

/**
 * Runs `buildProject` off the main thread. A build already running is left to
 * finish; a request that arrives while it is in flight replaces whatever was
 * previously waiting rather than queueing behind it, so a slider drag never
 * makes the preview grind through every intermediate value it passed through
 * on the way to where the user let go.
 *
 * Each request can carry a `tag`, handed back with its result. Coalescing
 * means some requests never run at all, so a caller that has to know *which*
 * question a build answers — the option gallery previewing a choice on hover,
 * where the answer decides what the cost line says — cannot infer it from the
 * order results arrive in.
 */
export function createProjectWorkerClient() {
  const worker = new Worker(new URL('./buildProject.worker.ts', import.meta.url), {
    type: 'module',
  });

  let busy = false;
  let pending: BuildRequest | null = null;
  let onResult: ((project: ProjectResult, tag: string | null) => void) | null = null;

  worker.onmessage = (event: MessageEvent<BuildReply>) => {
    // Resend before notifying: a listener reading `isBusy()` from inside its
    // callback (the store does, for its `building` flag) must see that a
    // coalesced request is already running, not the instant of false between
    // this build finishing and the next one starting.
    if (pending) {
      const next = pending;
      pending = null;
      send(next);
    } else {
      busy = false;
    }
    onResult?.(event.data.project, event.data.tag);
  };

  function send(request: BuildRequest) {
    busy = true;
    worker.postMessage(request);
  }

  return {
    /** Called with the finished project after every build the worker completes. */
    subscribe(listener: (project: ProjectResult, tag: string | null) => void) {
      onResult = listener;
    },
    /** Request a rebuild for these params, superseding any request not yet started. */
    request(params: ProjectParams, tag: string | null = null) {
      const next: BuildRequest = { params, tag };
      if (busy) {
        pending = next;
      } else {
        send(next);
      }
    },
    /** True while a build is running or another is already queued behind it. */
    isBusy(): boolean {
      return busy;
    },
  };
}
