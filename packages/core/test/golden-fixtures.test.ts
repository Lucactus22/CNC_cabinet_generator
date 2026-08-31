import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildProject, exportProject, type SheetFile } from '../src/index.js';
import { GOLDEN_FIXTURES } from './golden-fixtures.js';

/**
 * R-15. A byte-level regression net across the configurations `golden.test.ts`'s
 * single 0.1 fixture cannot reach — see `golden-fixtures.ts` for what each one
 * targets and why. Geometry tests elsewhere in this suite pin *that a feature
 * works*; this pins *that its output stops moving* once it does, generalising
 * the same byte-for-byte promise `golden.test.ts` makes for the 0.1 default,
 * order included: `_files.txt` in each fixture's directory records the exact
 * sequence `exportProject` returned, the order a workshop sets sheets up in.
 *
 * To update deliberately, after a change whose whole point is moving these
 * bytes: run
 *
 *   UPDATE_GOLDEN=1 npm test -- golden-fixtures
 *
 * from the repo root, inspect the diff under `golden/fixtures/<name>/` like any
 * other change, and say in the commit why the geometry moved. Never do this to
 * make a failure go away without first understanding why the bytes changed —
 * that is the one thing this test exists to catch.
 */
const GOLDEN_DIR = fileURLToPath(new URL('./golden/fixtures/', import.meta.url));
const UPDATE = process.env.UPDATE_GOLDEN === '1';
const MANIFEST = '_files.txt';

describe.each(GOLDEN_FIXTURES)('golden fixture: $name', ({ name, build }) => {
  const dir = `${GOLDEN_DIR}${name}/`;

  // Building is cheap (single-digit milliseconds, per ARCHITECTURE.md) but
  // happens once per fixture at collection time so `it.each(files)` below can
  // size itself. A fixture whose params are broken enough to throw — rather
  // than just recording a diagnostic, which is the normal way this pipeline
  // reports trouble — must not take the other fixtures' tests down with it:
  // an uncaught throw here aborts collection for the whole file.
  let files: SheetFile[];
  try {
    files = exportProject(buildProject(build())).files;
  } catch (error) {
    it(`fixture threw while building: ${(error as Error).message}`, () => {
      throw error;
    });
    return;
  }

  if (UPDATE) {
    it('is written to disk for review before committing', () => {
      mkdirSync(dir, { recursive: true });
      for (const file of files) writeFileSync(dir + file.name, file.dxf);
      writeFileSync(dir + MANIFEST, files.map((f) => f.name).join('\n') + '\n');
    });
    return;
  }

  it('produces exactly the committed files, in the committed order', () => {
    if (!existsSync(dir)) {
      throw new Error(
        `No golden files for '${name}' yet. Run 'UPDATE_GOLDEN=1 npm test -- golden-fixtures' ` +
          `from the repo root, review what it writes under golden/fixtures/${name}/, and commit it.`,
      );
    }
    const manifest = readFileSync(dir + MANIFEST, 'utf8').trim().split('\n');
    // Order matters — it is the sequence a workshop sets sheets up in — so
    // this is an ordered comparison, not a set. golden.test.ts pins the same
    // thing for the 0.1 fixture with a hand-written array; this one is
    // generated, because hand-maintaining one per fixture here would only
    // ever be copied from a passing run anyway.
    expect(files.map((f) => f.name)).toEqual(manifest);
    // A file left on disk that nothing above produces any more (e.g. after a
    // fixture's config changed) would pass the check above by never being
    // compared at all; this catches it as an unexplained extra.
    const onDisk = readdirSync(dir).filter((f) => f !== MANIFEST);
    expect(onDisk.sort()).toEqual(manifest.slice().sort());
  });

  // Only registered once the directory exists, so a genuinely new fixture
  // fails with the one clear message above instead of one confusing ENOENT
  // per file.
  if (existsSync(dir)) {
    it.each(files)('matches the committed bytes for $name', (file) => {
      const expected = readFileSync(dir + file.name, 'utf8');
      expect(file.dxf).toBe(expected);
    });
  }
});
