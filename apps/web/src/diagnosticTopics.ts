/**
 * Where a diagnostic's topic lives, and what to call it.
 *
 * Machine, nesting and hardware are the workshop's own settings — the
 * machine bed, the sheets it is cut from, the catalogue entries it bores
 * for — see `WorkshopDrawer`. A diagnostic naming one of those stays in the
 * global list; hiding it behind a door nobody has opened yet would be the
 * "say what is wrong" failure `CLAUDE.md` rules out. What moves behind the
 * door is the *fix* — the workshop carries a badge instead, so the count is
 * visible without opening it.
 */
export const WORKSHOP_TOPICS: ReadonlySet<string> = new Set(['machine', 'nesting', 'hardware']);

export const isWorkshopTopic = (topic: string): boolean => WORKSHOP_TOPICS.has(topic);

const TOPIC_LABELS: Record<string, string> = {
  project: 'This project',
  opening: 'The room',
  hardware: 'Hardware',
  machine: 'Machine',
  nesting: 'Nesting',
  joinery: 'Joinery',
  machining: 'Machining',
  structure: 'Structure',
  model: 'Notes',
};

/** Falls back to the raw topic, capitalised, for anything not named above. */
export function topicLabel(topic: string): string {
  return TOPIC_LABELS[topic] ?? topic.charAt(0).toUpperCase() + topic.slice(1);
}
