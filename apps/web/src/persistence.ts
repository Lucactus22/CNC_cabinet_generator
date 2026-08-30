import { normaliseParams, type ProjectParams } from '@cabgen/core';

const AUTOSAVE_KEY = 'cabgen:autosave';
const LIBRARY_KEY = 'cabgen:library';

export interface LibraryEntry {
  id: string;
  name: string;
  savedAt: string;
  params: ProjectParams;
}

// A 0.1 file has `base` and `top` where a current one has `cabinets` — the
// same check ExportBar's Open button uses, kept here so autosave and the
// library read anything Open would accept.
function looksLikeAProject(raw: unknown): raw is Record<string, unknown> {
  if (typeof raw !== 'object' || raw === null) return false;
  const r = raw as Record<string, unknown>;
  return Boolean(r.materials && (r.cabinets || r.base || r.top));
}

/**
 * The last set of parameters this browser had open, so a reload or a closed
 * tab does not throw away work that was never explicitly saved. `null` when
 * there is nothing, it is unreadable, or storage is unavailable (private
 * browsing) — any of which just means the app starts from the shipped
 * default, same as it always has.
 */
export function loadAutosave(): ProjectParams | null {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return looksLikeAProject(parsed) ? normaliseParams(parsed) : null;
  } catch {
    return null;
  }
}

export function saveAutosave(params: ProjectParams): void {
  try {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(params));
  } catch {
    // Storage full or disabled (private browsing). Losing the autosave is
    // not worth interrupting a woodworker mid-edit to report.
  }
}

function isLibraryEntryShaped(
  e: unknown,
): e is { id: unknown; name: unknown; savedAt: unknown; params: unknown } {
  return typeof e === 'object' && e !== null;
}

export function loadLibrary(): LibraryEntry[] {
  try {
    const raw = localStorage.getItem(LIBRARY_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry: unknown) => {
      if (!isLibraryEntryShaped(entry)) return [];
      const { id, name, savedAt, params } = entry;
      if (typeof id !== 'string' || typeof name !== 'string' || typeof savedAt !== 'string') {
        return [];
      }
      if (!looksLikeAProject(params)) return [];
      try {
        return [{ id, name, savedAt, params: normaliseParams(params) }];
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
}

export function saveLibrary(entries: LibraryEntry[]): void {
  try {
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(entries));
  } catch {
    // See saveAutosave.
  }
}
