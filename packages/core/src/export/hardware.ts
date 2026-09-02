import type { HandleRequest, HingeRequest, JointRequest, SlideRequest } from '../build/builder.js';
import { resolveHardware, type HardwareKind } from '../hardware/catalogue.js';
import type { Part, ProjectParams } from '../model/types.js';

export interface HardwareSummaryRow {
  kind: HardwareKind;
  name: string;
  /** What tells apart several SKUs sold under one name — a runner's length, say. */
  detail?: string;
  quantity: number;
  unit: string;
}

/** The requests `hardwareSummary` totals up — a subset of `BuildRequests`; wall mounts are screws, not hardware to order. */
export interface HardwareRequests {
  joints: JointRequest[];
  hinges: HingeRequest[];
  handles: HandleRequest[];
  slides: SlideRequest[];
}

/**
 * What to buy, one row per hardware kind — the sibling `materialSummary`
 * already gives for sheets. Each count comes straight off the same request
 * arrays `export/assembly.ts` turns into per-step lines, rather than parsing
 * those lines back apart: the numbers belong to the requests, the sentences
 * are that file's to write.
 */
export function hardwareSummary(
  params: ProjectParams,
  parts: Part[],
  requests: HardwareRequests,
): HardwareSummaryRow[] {
  const hw = resolveHardware(params.hardware);
  const rows: HardwareSummaryRow[] = [];

  const hingeCount = requests.hinges.reduce((a, r) => a + r.heights.length, 0);
  if (hingeCount > 0) {
    rows.push({ kind: 'hinge', name: hw.hinge.name, quantity: hingeCount, unit: 'hinge' });
  }

  if (hw.handle && requests.handles.length > 0) {
    rows.push({
      kind: 'handle',
      name: hw.handle.name,
      quantity: requests.handles.length,
      unit: 'handle',
    });
  }

  if (requests.slides.length > 0) {
    // Grouped by length as well as by name: a shopping list that said "12
    // pairs of TANDEM" and left the runner length to be worked out again at
    // the merchant's counter would not be much of a list.
    const byLength = new Map<number, number>();
    for (const s of requests.slides) byLength.set(s.length, (byLength.get(s.length) ?? 0) + 1);
    for (const [length, count] of [...byLength.entries()].sort((a, b) => a[0] - b[0])) {
      rows.push({
        kind: 'slide',
        name: hw.slide.name,
        detail: `${length} mm`,
        quantity: count,
        unit: 'pair',
      });
    }
  }

  // A shelf is fixed — jointed into the sides — or adjustable — resting free
  // on pins — never both, so a 'shelf' part the joint graph never mentions is
  // the loose one a bay's ladder holes are for. Four pins carry it: one row
  // front and back, on each side, the same count the assembly plan's own
  // step already gives it — see export/assembly.ts's leftoverSteps.
  const jointed = new Set(requests.joints.flatMap((j) => [j.maleId, j.femaleId]));
  const adjustableShelves = parts.filter((p) => p.role === 'shelf' && !jointed.has(p.id)).length;
  if (adjustableShelves > 0) {
    rows.push({
      kind: 'shelf-pin',
      name: hw.shelfPin.name,
      quantity: adjustableShelves * 4,
      unit: 'pin',
    });
  }

  return rows;
}
