import { describe, expect, it } from 'vitest';
import { buildProject, defaultParams, normaliseParams } from '../src/index.js';
import { base } from './carcasses.js';
import { BIT_DOWNCUT, BIT_UPCUT } from '../src/model/defaults.js';

const fluteErrors = (p = defaultParams()) =>
  buildProject(p).diagnostics.filter(
    (d) => d.severity === 'error' && d.message.includes('flutes are only'),
  );

describe("the shop's machine and bits", () => {
  it('starts on the Twotrees TTC-H40 bed: 1000 x 1000 x 100 mm', () => {
    // Retailers list the work area, not the axis travels. Every error the app
    // raises about a sheet or a part is measured against these three numbers,
    // so a bed entered a few millimetres long is a part that does not fit.
    const m = defaultParams().machine;
    expect(m.name).toBe('Twotrees TTC-H40');
    expect([m.travelX, m.travelY, m.travelZ]).toEqual([1000, 1000, 100]);
  });

  it('profiles with a cutter that is really in the drawer', () => {
    // The main cutter's diameter sets every dogbone and notch. If it drifts
    // from a bit the shop owns, the files are drawn for a tool nobody has.
    const { tool } = defaultParams();
    const upcut = tool.bits.find((b) => b.id === BIT_UPCUT)!;
    expect(upcut.kind).toBe('upcut');
    // SpeTool 6 mm shank, 24 mm cut length; the 6 mm cutter is the usual size.
    expect([upcut.diameter, upcut.fluteLength, upcut.shank]).toEqual([6, 24, 6]);
    expect(tool.diameter).toBe(upcut.diameter);
    expect(tool.fluteLength).toBe(upcut.fluteLength);
  });

  it('keeps the downcut spiral beside the upcut at the same size', () => {
    const { tool } = defaultParams();
    const down = tool.bits.find((b) => b.id === BIT_DOWNCUT)!;
    expect(down.kind).toBe('downcut');
    expect([down.diameter, down.fluteLength, down.shank]).toEqual([6, 24, 6]);
  });

  it('records the surfacing bit as a 1 in cutter, which no part is ever cut with', () => {
    const bit = defaultParams().tool.bits.find((b) => b.kind === 'surfacing')!;
    expect(bit.diameter).toBe(25.4);
    expect(bit.shank).toBe(6);
  });

  it('never invents a size the listing did not give', () => {
    // A V-groove or tapered bit with a made-up diameter would be offered as a
    // profiling cutter and size every notch in the project.
    for (const kind of ['v-groove', 'tapered-ball'] as const) {
      const bit = defaultParams().tool.bits.find((b) => b.kind === kind)!;
      expect(bit.diameter).toBeUndefined();
    }
  });

  it('gives a file saved before the drawer existed the drawer and the flute length', () => {
    const old = { tool: { diameter: 6, drillDiameter: 5 }, machine: { travelX: 1000 } };
    const p = normaliseParams(old);
    expect(p.tool.fluteLength).toBe(24);
    expect(p.tool.bits.length).toBeGreaterThan(0);
    expect(p.machine.name).toBe('Twotrees TTC-H40');
  });
});

describe('the flute length', () => {
  it('lets 18 mm ply through under 24 mm flutes', () => {
    expect(fluteErrors()).toEqual([]);
  });

  it('refuses stock thicker than the flutes, naming the material and the fix', () => {
    // The outline is cut full depth: past the flutes the shank rubs the kerf,
    // so the bit burns and snaps long before Z travel runs out.
    const p = defaultParams();
    p.materials[0]!.actualThickness = 30;
    const errs = fluteErrors(p);
    expect(errs).toHaveLength(1);
    expect(errs[0]!.message).toContain(p.materials[0]!.name);
    expect(errs[0]!.message).toContain('24 mm');
    expect(errs[0]!.hint).toContain('flute length');
    expect(errs[0]!.partIds!.length).toBeGreaterThan(1);
    expect(errs[0]!.message).toContain(`${errs[0]!.partIds!.length} parts`);
  });

  it('names the part when only one is too thick', () => {
    const p = defaultParams();
    // One carcass, so one back panel, and only the back is thicker than 18 mm.
    p.cabinets[0]!.carcasses = [p.cabinets[0]!.carcasses[0]!];
    p.materials[1]!.actualThickness = 20;
    p.tool.fluteLength = 18;
    const thick = buildProject(p).parts.filter((x) => x.thickness > 18);
    expect(thick).toHaveLength(1);
    const errs = fluteErrors(p);
    expect(errs).toHaveLength(1);
    expect(errs[0]!.message).toContain(thick[0]!.label);
    expect(errs[0]!.partIds).toEqual([thick[0]!.id]);
  });

  it('checks the solid stock of a face frame the same way', () => {
    const p = defaultParams();
    base(p).construction = 'face-frame';
    p.stockMaterials[0]!.actualThickness = 30;
    const errs = fluteErrors(p);
    expect(errs.map((d) => d.message).join(' ')).toContain(p.stockMaterials[0]!.name);
  });

  it('follows the setting: a short-flute cutter cannot cut 18 mm ply', () => {
    const p = defaultParams();
    p.tool.fluteLength = 15;
    expect(fluteErrors(p).length).toBeGreaterThan(0);
  });

  it('reports each material once, however many parts it holds', () => {
    const p = defaultParams();
    p.tool.fluteLength = 15;
    // 18 mm carcass and 12 mm back: only the carcass ply is too thick.
    expect(fluteErrors(p)).toHaveLength(1);
  });
});
