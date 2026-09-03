import { afterEach, beforeEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { buildProject } from '@cabgen/core';
import type { BuildReply, BuildRequest } from '../../src/worker/buildProject.worker';

/**
 * What a browser gives the app that jsdom does not.
 *
 * Loaded as a setup file so it runs before `store.ts` is imported, which
 * matters: the store constructs its two workers at module scope, and an
 * import that throws there takes every component test down with it rather
 * than failing one assertion.
 */

/**
 * `buildProject` on the main thread, wearing the worker's own protocol.
 *
 * jsdom has no `Worker`, and a module worker addressed by URL cannot be
 * loaded under the test runner either, so the alternative to a shim is
 * either mocking the client — which would leave the store's coalescing and
 * its `building` flag untested — or making the store's transport injectable,
 * which is production code shaped by a test.
 *
 * The reply is posted on a timer rather than returned, because the thing
 * worth exercising here is that the app copes with a project arriving one
 * turn *behind* the parameters that asked for it (R-12). A shim that
 * answered synchronously would pass with a store that had no such handling.
 */
let held: Array<() => void> | null = null;
let throwing: string | null = null;

class MainThreadBuildWorker {
  onmessage: ((event: MessageEvent<BuildReply>) => void) | null = null;

  postMessage(request: BuildRequest): void {
    // Cloned in both directions, because a real `postMessage` does. Passing
    // references would let two things through that a browser would not: a
    // value in `ProjectResult` that cannot be structured-cloned, and any
    // aliasing between the params sent and the project handed back. Both
    // would pass every component test and fail in front of a user.
    const sent = structuredClone(request);
    const deliver = (): void => {
      const reply: BuildReply =
        throwing === null
          ? { project: buildProject(sent.params), tag: sent.tag }
          : { error: throwing, tag: sent.tag };
      this.onmessage?.(new MessageEvent('message', { data: structuredClone(reply) }));
    };
    if (held) held.push(deliver);
    else setTimeout(deliver, 0);
  }

  terminate(): void {}
  addEventListener(): void {}
  removeEventListener(): void {}
}

/**
 * Keep every build in flight until `releaseBuilds` is called.
 *
 * The app spends real time in this state — `project` is a build behind
 * `params` on every keystroke — and refusing to export during it is what
 * stops a zip being written from the previous parameters' geometry. On a
 * machine fast enough to finish a build between a click's own `await`s,
 * that state cannot otherwise be caught standing still long enough to
 * assert against.
 */
export function holdBuilds(): void {
  held = [];
}

/**
 * Make every build fail with this message, the way the real worker reports a
 * throw out of `buildProject`.
 *
 * Nothing in the pipeline is *meant* to throw, which is exactly why this has
 * to be forced: the failure it produces — a preview older than the parameters,
 * with export still open on it — is the one this app exists not to have.
 */
export function failBuilds(message: string): void {
  throwing = message;
}

export function stopFailingBuilds(): void {
  throwing = null;
}

export function releaseBuilds(): void {
  const queued = held ?? [];
  held = null;
  for (const deliver of queued) deliver();
}

const globals = globalThis as unknown as Record<string, unknown>;
globals.Worker = MainThreadBuildWorker;

// jsdom implements no layout, so nothing can be scrolled into view. The app
// asks for it whenever the command palette sends the keyboard to a control.
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

// Used by the 3D viewport. Nothing here renders it, but a component that
// pulls it in transitively should fail on an assertion, not on a constructor.
if (!('ResizeObserver' in globals)) {
  globals.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
}

// Every parameter edit clones the project first, so without this the store
// cannot apply a single change.
if (typeof globals.structuredClone !== 'function') {
  globals.structuredClone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
}

beforeEach(() => {
  // A test that held or broke a build and then failed itself must not leave
  // every test after it waiting on a reply that will never come.
  releaseBuilds();
  stopFailingBuilds();
  // The store reads the autosave, the library, the saved workshops and the
  // theme out of `localStorage` when its module is first imported, and writes
  // to it as tests run. Clearing between tests keeps one test's saved design
  // from being another's starting point.
  localStorage.clear();
});

afterEach(cleanup);
