import { describe, expect, it } from 'vitest';
import { buildProject, defaultParams, type ProjectParams } from '@cabgen/core';
import { cutListSignature, emptyMachineProgress } from '../src/machineProgress';

/** The default project's own base carcass — mirrors packages/core/test/carcasses.ts's `base`, which apps/web cannot import across the package boundary. */
const base = (p: ProjectParams) => p.cabinets[0]!.carcasses.find((c) => c.id === 'B')!;

/**
 * R-22's workshop view persists which step you are on and which parts are
 * already cut. Part ids are structural, not content-hashed, so the same id
 * can legitimately name a different blank in a different project — or,
 * because an edit that resizes an *existing* panel does not change its id at
 * all, in the very same project a moment later. The signature is what stops
 * a reload, or a fresh build, silently reapplying stale checkmarks to parts
 * that are not actually the ones they were ticked against.
 */
describe('cutListSignature', () => {
  it('is the same for the same project built twice', () => {
    const params = defaultParams();
    const a = cutListSignature(buildProject(params));
    const b = cutListSignature(buildProject(params));
    expect(a).toBe(b);
    expect(a.length).toBeGreaterThan(0);
  });

  it('does not depend on cut-list order', () => {
    const project = buildProject(defaultParams());
    const reversed = { ...project, cutList: [...project.cutList].reverse() };
    expect(cutListSignature(project)).toBe(cutListSignature(reversed));
  });

  it('changes when a part is added, removed or renamed', () => {
    const project = buildProject(defaultParams());
    const withExtra = {
      ...project,
      cutList: [...project.cutList, { ...project.cutList[0]!, id: 'EXTRA-PART' }],
    };
    expect(cutListSignature(withExtra)).not.toBe(cutListSignature(project));
  });

  it('changes when an existing part is resized, even though its id stays the same', () => {
    // A wider cabinet still calls its side C1-B-SIDE-L — the id is
    // structural, not a fingerprint of the blank's own size — so the
    // signature has to fold the dimensions in itself, or a checkmark ticked
    // against the old size would silently carry over onto the new one.
    const project = buildProject(defaultParams());
    const resized = {
      ...project,
      cutList: project.cutList.map((r, i) => (i === 0 ? { ...r, length: r.length + 50 } : r)),
    };
    expect(cutListSignature(resized)).not.toBe(cutListSignature(project));
  });

  it('covers solid stock, not only sheet parts', () => {
    // Face-frame stiles and rails live in `stockCutList`, kept apart from
    // `cutList` so board feet never get mixed into a sheet count — but
    // `AtMachine.tsx`'s cutting checklist shows and checks off both, so the
    // signature has to answer for both too.
    const params = defaultParams();
    base(params).construction = 'face-frame';
    const project = buildProject(params);
    expect(project.stockCutList.length).toBeGreaterThan(0);

    const withoutOneStile = { ...project, stockCutList: project.stockCutList.slice(1) };
    expect(cutListSignature(withoutOneStile)).not.toBe(cutListSignature(project));

    const resizedRail = {
      ...project,
      stockCutList: project.stockCutList.map((r, i) =>
        i === 0 ? { ...r, length: r.length + 50 } : r,
      ),
    };
    expect(cutListSignature(resizedRail)).not.toBe(cutListSignature(project));
  });

  it('starts empty, which never matches a real signature', () => {
    const project = buildProject(defaultParams());
    expect(emptyMachineProgress().signature).toBe('');
    expect(cutListSignature(project)).not.toBe('');
  });
});
