import { normaliseParams, type ProjectParams } from '@cabgen/core';
import type { WorkshopProfile, WorkshopSettings } from './workshop';

const AUTOSAVE_KEY = 'cabgen:autosave';
const LIBRARY_KEY = 'cabgen:library';
const STARTERS_KEY = 'cabgen:starters-seen';

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

/**
 * Whether the gallery of starter designs has been past this browser before.
 *
 * Kept apart from the autosave because dismissing it without touching
 * anything writes no project, and a front door that reappears every reload is
 * the kind of thing this interface has a rule against.
 */
export function startersSeen(): boolean {
  try {
    return localStorage.getItem(STARTERS_KEY) === 'yes';
  } catch {
    // Storage disabled: show it, once per session, rather than never.
    return false;
  }
}

export function markStartersSeen(): void {
  try {
    localStorage.setItem(STARTERS_KEY, 'yes');
  } catch {
    // Nothing to do; it will offer itself again next time.
  }
}

// ---------------------------------------------------------------------------
// Contextual suggestions
// ---------------------------------------------------------------------------

const SUGGESTIONS_KEY = 'cabgen:suggestions-seen';

/**
 * Which quiet suggestions this browser has already been shown.
 *
 * R-19's bar for these is that they never repeat: shown once, and gone for
 * good whether they were acted on, dismissed, or simply scrolled past. That
 * promise is only as good as this store, so a suggestion is written here the
 * moment it stops being on screen rather than when somebody clicks the ✕ —
 * the one thing worse than a tip is the same tip twice.
 */
export function suggestionsSeen(): string[] {
  try {
    const raw = localStorage.getItem(SUGGESTIONS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    // Storage disabled: nothing has been seen, and nothing will be recorded.
    // A suggestion shown once per session is the failure mode, which is the
    // gentler of the two available.
    return [];
  }
}

export function markSuggestionSeen(id: string): void {
  try {
    const seen = suggestionsSeen();
    if (seen.includes(id)) return;
    localStorage.setItem(SUGGESTIONS_KEY, JSON.stringify([...seen, id]));
  } catch {
    // See saveAutosave.
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

// ---------------------------------------------------------------------------
// Workshop profiles
// ---------------------------------------------------------------------------

const PROFILES_KEY = 'cabgen:workshops';

/**
 * Saved workshop profiles. Same store as the project library, and the same
 * limit: this is `localStorage`, so it is per-browser and per-device. A
 * profile does not follow you from the laptop at the bench to the tablet at
 * the machine — see docs/UX.md, question 3.
 */
export function loadProfiles(): WorkshopProfile[] {
  try {
    const raw = localStorage.getItem(PROFILES_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry: unknown) => {
      if (typeof entry !== 'object' || entry === null) return [];
      const { id, name, savedAt, settings } = entry as Record<string, unknown>;
      if (typeof id !== 'string' || typeof name !== 'string' || typeof savedAt !== 'string') {
        return [];
      }
      if (!isWorkshopShaped(settings)) return [];
      return [{ id, name, savedAt, settings }];
    });
  } catch {
    return [];
  }
}

/**
 * Enough of a shape check that a half-written profile cannot reach
 * `applyWorkshop` and leave a project with no materials at all. It does not
 * validate every field: a profile is written by this app, and the failure
 * being guarded against is a truncated or hand-edited entry, not a hostile one.
 */
function isWorkshopShaped(raw: unknown): raw is WorkshopSettings {
  if (typeof raw !== 'object' || raw === null) return false;
  const r = raw as Record<string, unknown>;
  return Boolean(
    r.machine &&
    r.tool &&
    r.nesting &&
    Array.isArray(r.materials) &&
    r.materials.length > 0 &&
    Array.isArray(r.stockMaterials) &&
    Array.isArray(r.bandingMaterials) &&
    r.hardware,
  );
}

export function saveProfiles(entries: WorkshopProfile[]): void {
  try {
    localStorage.setItem(PROFILES_KEY, JSON.stringify(entries));
  } catch {
    // See saveAutosave.
  }
}
