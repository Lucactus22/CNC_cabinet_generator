/**
 * What a browser gives `apps/web` that jsdom does not.
 *
 * Loaded for every test file (see `vitest.config.ts`) and inert under the
 * `node` environment `packages/core`'s own tests run in, so the core suite is
 * unaffected by any of it.
 *
 * Four shims, each here for a reason rather than to silence an error:
 *
 * **`Worker`** — the store creates two at module scope (R-12), and jsdom has
 * none. Rather than mock the store, this runs the *real* `buildProject` in
 * process and hands the result back through `onmessage`, so a panel under test
 * drives the same pipeline the app does and a component test can be wrong
 * about the geometry. Delivery is a microtask, which keeps the worker client's
 * own coalescing honest: two requests in one tick still leave the second
 * pending behind the first, exactly as they do across a real thread.
 *
 * **`getClientRects`** — `useDialog` filters its focus stops by whether an
 * element has any, because `offsetParent` is null for the `position: fixed`
 * overlays it guards. jsdom has no layout, so *nothing* has rects and the trap
 * would test its own degenerate branch instead of the wrap. The shim answers
 * the question layout would: an element that is in the document and not hidden
 * has a rect. Anything that needs a real *size* belongs in the Playwright
 * suite, not here.
 *
 * **`matchMedia`** — `theme.ts` already treats its absence as "assume dark",
 * so without this every component test would silently exercise the fallback
 * rather than the branch a browser takes.
 *
 * **`scrollIntoView` / `URL.createObjectURL`** — unimplemented in jsdom and
 * called by find-by-name and by every download path. Recorded rather than
 * discarded, so a test can assert that a file was actually offered.
 */
import { buildProject, type ProjectParams } from '@cabgen/core';

interface BuildRequest {
  params: ProjectParams;
  tag: string | null;
}

/** Object URLs handed out since the last reset, newest last. */
export const objectUrls: Blob[] = [];

if (typeof window !== 'undefined') {
  class InProcessWorker {
    onmessage: ((event: MessageEvent) => void) | null = null;

    postMessage(request: BuildRequest): void {
      const project = buildProject(request.params);
      queueMicrotask(() =>
        this.onmessage?.({ data: { project, tag: request.tag } } as MessageEvent),
      );
    }

    terminate(): void {}
    addEventListener(): void {}
    removeEventListener(): void {}
  }

  Object.defineProperty(globalThis, 'Worker', { value: InProcessWorker, writable: true });

  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;

  Element.prototype.scrollIntoView = function scrollIntoView(): void {};

  const laidOut = new DOMRect(0, 0, 100, 20);
  Element.prototype.getClientRects = function getClientRects(): DOMRectList {
    const el = this as HTMLElement;
    const hidden =
      !el.isConnected || el.hidden || el.closest('[hidden]') !== null || isDisplayNone(el);
    const rects = hidden ? [] : [laidOut];
    return Object.assign(rects, {
      item: (i: number) => rects[i] ?? null,
    }) as unknown as DOMRectList;
  };

  URL.createObjectURL = (blob: Blob): string => {
    objectUrls.push(blob);
    return `blob:cabgen/${objectUrls.length}`;
  };
  URL.revokeObjectURL = (): void => {};
}

function isDisplayNone(el: HTMLElement): boolean {
  for (let node: HTMLElement | null = el; node; node = node.parentElement) {
    if (node.style.display === 'none') return true;
  }
  return false;
}
