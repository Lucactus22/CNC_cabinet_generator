import type { ProjectParams } from '@cabgen/core';

/**
 * The half of a project that describes the workshop rather than the furniture.
 *
 * One spindle, one machine, one stack of sheets, one drawer of hinges — none
 * of it changes between two designs cut in the same shop, and R-16 measured it
 * at almost exactly half the old sidebar. Saved under a name so a second
 * design starts already knowing the machine.
 *
 * It is a *value you apply*, never a pointer a project follows. The measured
 * thickness of the sheet a design was cut to sets every groove width in it, so
 * a project that silently re-cut itself to whoever opened it would be the
 * "silently producing a wrong cabinet" failure CLAUDE.md calls the worst
 * outcome available. Applying a profile is an ordinary, undoable parameter
 * update that says what it changed.
 */
export interface WorkshopProfile {
  id: string;
  name: string;
  savedAt: string;
  settings: WorkshopSettings;
}

export interface WorkshopSettings {
  machine: ProjectParams['machine'];
  tool: ProjectParams['tool'];
  nesting: ProjectParams['nesting'];
  materials: ProjectParams['materials'];
  stockMaterials: ProjectParams['stockMaterials'];
  bandingMaterials: ProjectParams['bandingMaterials'];
  hardware: ProjectParams['hardware'];
  /** Which sheet each role is cut from: meaningless without the sheets themselves. */
  carcassMaterialId: string;
  shelfMaterialId: string;
  drawerBoxMaterialId: string;
}

export function workshopOf(params: ProjectParams): WorkshopSettings {
  return structuredClone({
    machine: params.machine,
    tool: params.tool,
    nesting: params.nesting,
    materials: params.materials,
    stockMaterials: params.stockMaterials,
    bandingMaterials: params.bandingMaterials,
    hardware: params.hardware,
    carcassMaterialId: params.carcassMaterialId,
    shelfMaterialId: params.shelfMaterialId,
    drawerBoxMaterialId: params.drawerBoxMaterialId,
  });
}

/**
 * Apply a profile to a project in place, and report every reference it had to
 * repoint.
 *
 * A project holds material ids in places the profile does not own — the doors,
 * each carcass's back and face frame, the scribe strips, the banding rules.
 * A profile from another shop will not have those ids, and leaving a dangling
 * id would drop the part's thickness to whatever the fallback happens to be
 * without anyone being told. So they are repointed to the nearest equivalent
 * and the changes are listed: an applied profile that quietly changed the
 * material a door is cut from is exactly the failure this app exists to avoid.
 */
export function applyWorkshop(params: ProjectParams, settings: WorkshopSettings): string[] {
  // What the outgoing shop called each thing, captured before its list is
  // replaced: reporting a bare id ("sheet3-mthdo22a") tells nobody which
  // sheet their doors used to be cut from.
  const wasCalled = new Map<string, string>();
  for (const m of [...params.materials, ...params.stockMaterials, ...params.bandingMaterials]) {
    wasCalled.set(m.id, m.name);
  }

  const next = structuredClone(settings);
  params.machine = next.machine;
  params.tool = next.tool;
  params.nesting = next.nesting;
  params.materials = next.materials;
  params.stockMaterials = next.stockMaterials;
  params.bandingMaterials = next.bandingMaterials;
  params.hardware = next.hardware;
  params.carcassMaterialId = next.carcassMaterialId;
  params.shelfMaterialId = next.shelfMaterialId;
  params.drawerBoxMaterialId = next.drawerBoxMaterialId;

  const notes: string[] = [];
  const repoint = (
    id: string,
    what: string,
    stock: Array<{ id: string; name: string }>,
  ): string => {
    if (stock.some((m) => m.id === id)) return id;
    const to = stock[0];
    if (!to) return id;
    notes.push(
      `This workshop does not stock ${wasCalled.get(id) ?? id}, so ${what} is now ${to.name}.`,
    );
    return to.id;
  };
  const sheet = (id: string, what: string): string => repoint(id, what, params.materials);
  const stock = (id: string, what: string): string => repoint(id, what, params.stockMaterials);
  const tape = (id: string, what: string): string => repoint(id, what, params.bandingMaterials);

  params.carcassMaterialId = sheet(params.carcassMaterialId, 'the carcass material');
  params.shelfMaterialId = sheet(params.shelfMaterialId, 'the shelf material');
  params.drawerBoxMaterialId = sheet(params.drawerBoxMaterialId, 'the drawer box material');
  params.doors.materialId = sheet(params.doors.materialId, 'the door material');
  params.opening.scribe.materialId = sheet(params.opening.scribe.materialId, 'the scribe material');
  for (const cabinet of params.cabinets) {
    for (const carcass of cabinet.carcasses) {
      const box = `${cabinet.id}-${carcass.id}`;
      carcass.back.materialId = sheet(carcass.back.materialId, `${box}'s back`);
      carcass.faceFrame.materialId = stock(carcass.faceFrame.materialId, `${box}'s face frame`);
    }
  }
  for (const [role, spec] of Object.entries(params.edgeBanding)) {
    if (spec) spec.materialId = tape(spec.materialId, `the tape on the ${role} edges`);
  }
  return notes;
}
