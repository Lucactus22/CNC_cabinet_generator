import { CATALOG, selectionFor, type CatalogEntry } from './catalog';
import { useStore } from './store';

/**
 * Going to a control, from anywhere.
 *
 * The command palette worked this out first; the showroom and the contextual
 * suggestions need exactly the same thing — take me to where this is set —
 * so it lives here rather than being written three times with three different
 * ideas about what happens to the workshop drawer.
 */
export function useGoTo(): {
  toEntry: (entry: CatalogEntry) => void;
  /** By catalogue path. Does nothing if nothing claims that path, which the tests forbid. */
  toParam: (path: string) => void;
} {
  const params = useStore((s) => s.params);
  const selection = useStore((s) => s.selection);
  const reveal = useStore((s) => s.reveal);

  const toEntry = (entry: CatalogEntry): void => {
    if (entry.where.surface === 'workshop') {
      reveal({ surface: 'bench', workshop: true, param: entry.path });
      return;
    }
    reveal({
      surface: 'bench',
      workshop: false,
      selection: selectionFor(entry.where, params, selection),
      param: entry.path,
    });
  };

  return {
    toEntry,
    toParam: (path) => {
      const entry = CATALOG.find((e) => e.path === path);
      if (entry) toEntry(entry);
    },
  };
}
