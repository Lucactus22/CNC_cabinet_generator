import type { ProjectParams, ProjectResult } from '@cabgen/core';

/**
 * Runs `buildProject` off the main thread. A build already running is left to
 * finish; a request that arrives while it is in flight replaces whatever was
 * previously waiting rather than queueing behind it, so a slider drag never
 * makes the preview grind through every intermediate value it passed through
 * on the way to where the user let go.
 */
export function createProjectWorkerClient() {
  const worker = new Worker(new URL('./buildProject.worker.ts', import.meta.url), {
    type: 'module',
  });

  let busy = false;
  let pending: ProjectParams | null = null;
  let onResult: ((project: ProjectResult) => void) | null = null;

  worker.onmessage = (event: MessageEvent<ProjectResult>) => {
    // Resend before notifying: a listener reading `isBusy()` from inside its
    // callback (the store does, for its `building` flag) must see that a
    // coalesced request is already running, not the instant of false between
    // this build finishing and the next one starting.
    if (pending) {
      const params = pending;
      pending = null;
      send(params);
    } else {
      busy = false;
    }
    onResult?.(event.data);
  };

  function send(params: ProjectParams) {
    busy = true;
    worker.postMessage(params);
  }

  return {
    /** Called with the finished project after every build the worker completes. */
    subscribe(listener: (project: ProjectResult) => void) {
      onResult = listener;
    },
    /** Request a rebuild for these params, superseding any request not yet started. */
    request(params: ProjectParams) {
      if (busy) {
        pending = params;
      } else {
        send(params);
      }
    },
    /** True while a build is running or another is already queued behind it. */
    isBusy(): boolean {
      return busy;
    },
  };
}
