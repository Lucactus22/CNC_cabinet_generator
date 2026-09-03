import { describe, expect, it } from 'vitest';
import {
  buildProject,
  defaultExportOptions,
  defaultParams,
  exportProject,
  partsNeedingFlip,
} from '@cabgen/core';
import { summarise } from '../src/diagnosticsGrouping';
import { offeredFixes } from '../src/fixes';
import { STARTERS } from '../src/gallery/starters';

/**
 * The getting-started guide, held to what it promises.
 *
 * A guide is the one kind of documentation somebody follows *while committing
 * material*. Every number in it is a number they will act on, so the ones that
 * come out of the pipeline are read back out of the pipeline here rather than
 * trusted to stay true. This is the same device `explain.test.ts` uses for the
 * in-app explanations, applied to the walk a newcomer takes.
 *
 * A failure here means the guide is now lying, not that the code is wrong.
 * Work out which of the two moved, then fix that one.
 */

const DOCS = import.meta.glob('../../../docs/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const GUIDE = (() => {
  const key = Object.keys(DOCS).find((k) => k.endsWith('/GETTING-STARTED.md'));
  if (key === undefined) throw new Error('no docs/GETTING-STARTED.md');
  return DOCS[key]!;
})();

/** Markdown wraps, so a sentence quoted in the guide arrives across lines. */
const flat = (text: string): string => text.replace(/\s+/g, ' ').trim();
const guideSays = (phrase: string): boolean => flat(GUIDE).includes(flat(phrase));

const fresh = () => {
  const params = defaultParams();
  return { params, project: buildProject(params) };
};

/** The project the guide has you reach by pressing the first offered fix. */
function cuttable(): ReturnType<typeof buildProject> {
  const { params, project } = fresh();
  const fix = offeredFixes(params, project)[0]!;
  const next = structuredClone(params);
  fix.apply(next);
  return buildProject(next);
}

describe('the walk the guide describes', () => {
  it('opens on the five designs it names', () => {
    expect(STARTERS).toHaveLength(5);
    for (const starter of STARTERS) {
      expect(guideSays(starter.name.toLowerCase().replace(/^the /, ''))).toBe(true);
    }
  });

  it('meets the two blocking errors it warns about, in the words it quotes', () => {
    const { project } = fresh();
    expect(summarise(project.diagnostics)).toBe('2 blocking');
    const errors = project.diagnostics.filter((d) => d.severity === 'error');
    // The guide quotes one of them rather than paraphrasing it, so somebody
    // comparing the screen against the page is comparing the same sentence.
    const quoted = flat(
      GUIDE.split('\n')
        .filter((l) => l.startsWith('> '))
        .map((l) => l.slice(2))
        .join(' '),
    );
    expect(quoted).not.toBe('');
    expect(errors.map((e) => flat(e.message))).toContain(quoted);
  });

  it('is right that the first offered fix clears everything blocking, and costs something', () => {
    const { params, project } = fresh();
    const fixes = offeredFixes(params, project);
    expect(fixes.length).toBeGreaterThan(0);
    expect(fixes[0]!.errorsAfter).toBe(0);
    // "with what it costs in sheets and yield written on the button" — a fix
    // that silently spent two more sheets would make the sentence a lie.
    expect(fixes[0]!.cost).not.toBe('');
  });

  it('is right about what the chip says once it is cuttable', () => {
    // The guide tells somebody about to cut that *n to check* is normal and
    // only *blocking* stops them. If that stopped being true they would stand
    // at the machine waiting for a green light that never comes.
    expect(summarise(cuttable().diagnostics)).toBe('6 to check');
  });
});

describe('what the guide says comes out', () => {
  const bundle = exportProject(cuttable(), defaultExportOptions());
  const names = bundle.files.map((f) => f.name);

  it('produces files of exactly the three shapes it tabulates', () => {
    const patterns = [/-sheet\d+\.dxf$/, /-sheet\d+-tile\d+\.dxf$/, /-cutlist\.csv$/];
    for (const pattern of patterns) expect(names.some((n) => pattern.test(n))).toBe(true);
    for (const name of names) expect(patterns.some((p) => p.test(name))).toBe(true);
  });

  it('writes every layer it tells you to set a toolpath for', () => {
    const written = new Set(
      bundle.files
        .filter((f) => f.name.endsWith('.dxf'))
        .flatMap((f) => f.dxf.split('\n').map((l) => l.trim())),
    );
    for (const layer of ['OUTLINE', 'POCKET_D6', 'DRILL_5_D12', 'DRILL_4.5_THRU', 'LABEL']) {
      expect(guideSays(layer)).toBe(true);
      expect(written.has(layer)).toBe(true);
    }
    // Named as reference only — machining them would engrave the ids into the
    // parts and cut the sheet outline through the spoilboard.
    expect(written.has('SHEET')).toBe(true);
    expect(guideSays('`LABEL` and `SHEET` are reference only')).toBe(true);

    // THROUGH is the one the default project never writes: nothing in a
    // stopped-dado carcass goes right through a panel. Knocking the joinery
    // over to tab and slot is what puts it in the file.
    const knockDown = defaultParams();
    knockDown.joinery.carcassJoint = 'tabslot';
    const cut = exportProject(buildProject(knockDown), defaultExportOptions());
    expect(guideSays('THROUGH')).toBe(true);
    expect(cut.files.some((f) => f.dxf.split('\n').some((l) => l.trim() === 'THROUGH'))).toBe(true);
  });

  it('renames a decimal layer the way it says safe names do', () => {
    const safe = exportProject(cuttable(), { ...defaultExportOptions(), safeNames: true });
    const written = new Set(
      safe.files
        .filter((f) => f.name.endsWith('.dxf'))
        .flatMap((f) => f.dxf.split('\n').map((l) => l.trim())),
    );
    expect(written.has('DRILL_4P5_THRU')).toBe(true);
    expect(guideSays('`POCKET_D6.35` becomes `POCKET_D6P35`')).toBe(true);
  });

  it('drills the registration holes the tiling workflow tells you to pin through', () => {
    expect(guideSays('It drills the `TILE_REG` holes through the waste into your')).toBe(true);
    const tiled = bundle.files.filter((f) => /-tile\d+\.dxf$/.test(f.name));
    expect(tiled.length).toBeGreaterThan(0);
    expect(tiled.some((f) => f.dxf.includes('TILE_REG'))).toBe(true);
  });
});

describe('what the guide says about the parts', () => {
  it('names a part id that the default project really produces, and means it', () => {
    const part = cuttable().parts.find((p) => p.id === 'C1-B-SIDE-L');
    expect(part).toBeDefined();
    expect(part!.label).toBe('Base side, left');
    expect(guideSays('`C1-B-SIDE-L` is the left side of the base')).toBe(true);
  });

  /**
   * The guide sends somebody to the machine expecting to turn over exactly one
   * kind of panel. Being wrong here costs a ruined sheet: either they flip
   * something that did not need it and lose the registration, or they miss one
   * that did and machine the second face on the wrong side.
   */
  it('is right that only a divider with shelves on both sides has to be turned over', () => {
    const flipped = partsNeedingFlip(cuttable().parts);
    for (const part of flipped) expect(part.id).toMatch(/-DIV-/);
    expect(guideSays('except a divider with shelves on')).toBe(true);
  });
});

describe('the guide itself', () => {
  it('links only to documents that exist', () => {
    const links = [...GUIDE.matchAll(/\]\((\.\.?\/[^)#]+\.md)(#[^)]*)?\)/g)].map((m) => m[1]!);
    expect(links.length).toBeGreaterThan(0);
    const known = new Set(Object.keys(DOCS).map((k) => k.slice(k.lastIndexOf('/') + 1)));
    for (const link of links) {
      const file = link.slice(link.lastIndexOf('/') + 1);
      // The one link out of docs/ is the README at the repository root.
      if (link.startsWith('../') && !link.startsWith('../../')) {
        expect(file).toBe('README.md');
        continue;
      }
      expect(known.has(file)).toBe(true);
    }
  });

  it('quotes a sheet thickness range the shipped defaults sit inside', () => {
    expect(guideSays('17.4–17.8 mm')).toBe(true);
    const sheet = defaultParams().materials[0]!;
    expect(sheet.actualThickness).toBeGreaterThanOrEqual(17.4);
    expect(sheet.actualThickness).toBeLessThanOrEqual(17.8);
  });
});
