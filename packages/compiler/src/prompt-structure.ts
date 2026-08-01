import type { StatementKind } from "../../semantic-ir/src/index";

export interface PromptSectionItem {
  text: string;
  start: number;
  end: number;
}

export interface PromptSection {
  field: StatementKind;
  label: string;
  start: number;
  end: number;
  items: PromptSectionItem[];
}

export interface PromptFormInspection {
  mode: "structured" | "prose";
  present: StatementKind[];
  missing: StatementKind[];
  score: number;
}

export interface PromptGuideField {
  field: StatementKind;
  label: string;
  pattern: string;
  required: boolean;
}

const FIELD_ORDER: StatementKind[] = [
  "goal",
  "target",
  "action",
  "input",
  "output",
  "require",
  "prefer",
  "forbid",
  "verify",
  "on_failure",
];

const LABEL_TO_FIELD: Record<string, StatementKind> = {
  goal: "goal",
  objective: "goal",
  outcome: "goal",
  target: "target",
  scope: "target",
  component: "target",
  action: "action",
  operation: "action",
  input: "input",
  inputs: "input",
  context: "input",
  output: "output",
  outputs: "output",
  deliverable: "output",
  deliverables: "output",
  requirement: "require",
  requirements: "require",
  constraint: "require",
  constraints: "require",
  preference: "prefer",
  preferences: "prefer",
  preferred: "prefer",
  forbidden: "forbid",
  prohibition: "forbid",
  prohibitions: "forbid",
  "do not": "forbid",
  verification: "verify",
  verify: "verify",
  checks: "verify",
  "acceptance criteria": "verify",
  "on failure": "on_failure",
  "failure handling": "on_failure",
  recovery: "on_failure",
};

const HEADER_PATTERN = new RegExp(
  `^\\s*(?:#{1,3}\\s*)?(${Object.keys(LABEL_TO_FIELD)
    .sort((left, right) => right.length - left.length)
    .map((label) => label.replaceAll(" ", "\\s+"))
    .join("|")})\\s*:\\s*`,
  "gimu",
);

const PROSE_CUES: Record<StatementKind, RegExp> = {
  goal: /\b(?:add|build|create|fix|implement|improve|migrate|remove|update|analy[sz]e|optimi[sz]e|secure|document)\b/iu,
  target: /\b(?:api|component|endpoint|feature|file|interface|module|page|pipeline|repository|screen|service|system|workflow)\b/iu,
  action: /\b(?:create|delete|implement|modify|read|remove|update|validate|transform|migrate|publish|restore)\b/iu,
  input: /\b(?:accept|given|input|receive|using|with|from)\b/iu,
  output: /\b(?:deliver|emit|output|produce|respond|return|result)\b/iu,
  require: /\b(?:must|require|ensure|preserve|remain|within|under|at\s+most)\b/iu,
  prefer: /\b(?:prefer|ideally|if\s+possible|favor)\b/iu,
  forbid: /\b(?:do\s+not|don't|must\s+not|never|avoid|forbid|without)\b/iu,
  verify: /\b(?:verify|test|check|confirm|assert|acceptance\s+criteria)\b/iu,
  on_failure: /\b(?:on\s+failure|if\s+.+?fails?|rollback|roll\s+back|retry|abort|stop|restore|preserve\s+diagnostics)\b/iu,
};

export const PROMPT_GUIDE_FIELDS: readonly PromptGuideField[] = [
  { field: "goal", label: "Goal", pattern: "Add one user-visible capability.", required: true },
  { field: "target", label: "Target", pattern: "Product search endpoint in the catalog service.", required: true },
  { field: "action", label: "Action", pattern: "Implement, update, migrate, analyze, or remove.", required: true },
  { field: "input", label: "Inputs", pattern: "Name every file, payload, query, option, and example.", required: true },
  { field: "output", label: "Outputs", pattern: "Name the patch, response, report, artifact, or observable result.", required: true },
  { field: "require", label: "Requirements", pattern: "State invariants and numeric limits with units.", required: true },
  { field: "prefer", label: "Preferences", pattern: "State optional design qualities separately.", required: false },
  { field: "forbid", label: "Forbidden", pattern: "Name APIs, files, data, or behavior that must not change.", required: true },
  { field: "verify", label: "Verification", pattern: "Name exact tests, checks, budgets, and acceptance evidence.", required: true },
  { field: "on_failure", label: "On failure", pattern: "Choose rollback, retry limit, diagnostics, and stop behavior.", required: true },
] as const;

export const STRUCTURED_PROMPT_TEMPLATE = `Goal: Add paginated product search.
Target: Product search endpoint in the catalog service.
Action: Implement.
Inputs:
- text query
- category filter
- page size
- cursor
Outputs:
- paginated product list
- next cursor
Requirements:
- validate all inputs
- keep response latency under 200 ms
- preserve backward compatibility
Preferences:
- keep the change minimal and modular
Forbidden:
- expose internal inventory costs
- modify the checkout API
Verification:
- unit tests pass
- integration tests pass
- pagination order is stable
- response latency stays under 200 ms
On failure:
- roll back changes
- preserve diagnostics
- retry once, then abort`;

function cleanItem(value: string): string {
  return value
    .replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+)/u, "")
    .replace(/^\s*(?:and|then)\s+/iu, "")
    .trim()
    .replace(/[.;]+$/u, "")
    .trim();
}

function sectionItems(source: string, start: number, end: number, field: StatementKind): PromptSectionItem[] {
  const raw = source.slice(start, end);
  const lines = raw.split(/\r?\n/u);
  const hasBullets = lines.some((line) => /^\s*(?:[-*+]\s+|\d+[.)]\s+)/u.test(line));
  const pieces = (hasBullets || lines.length > 1 ? lines : raw.split(/[;,]/u))
    .flatMap((line) => (hasBullets ? [line] : line.split(/\s+\band\b\s+(?=[A-Za-z])/iu)))
    .map(cleanItem)
    .filter(Boolean);

  const limited = field === "goal" || field === "target" || field === "action" ? pieces.slice(0, 1) : pieces;
  let cursor = start;
  return limited.map((text) => {
    const found = source.toLowerCase().indexOf(text.toLowerCase(), cursor);
    const itemStart = found >= start && found < end ? found : cursor;
    cursor = itemStart + text.length;
    return { text, start: itemStart, end: itemStart + text.length };
  });
}

export function parsePromptSections(source: string): PromptSection[] {
  const matches = [...source.matchAll(HEADER_PATTERN)];
  return matches.map((match, index) => {
    const label = (match[1] ?? "").toLowerCase().replace(/\s+/gu, " ");
    const field = LABEL_TO_FIELD[label];
    const contentStart = match.index + match[0].length;
    const end = matches[index + 1]?.index ?? source.length;
    return {
      field,
      label: match[1] ?? label,
      start: match.index,
      end,
      items: sectionItems(source, contentStart, end, field),
    };
  });
}

export function inspectPromptForm(source: string): PromptFormInspection {
  const sections = parsePromptSections(source);
  const present = new Set<StatementKind>(sections.filter((section) => section.items.length).map((section) => section.field));
  if (!sections.length) {
    for (const field of FIELD_ORDER) if (PROSE_CUES[field].test(source)) present.add(field);
  }
  const orderedPresent = FIELD_ORDER.filter((field) => present.has(field));
  const missing = FIELD_ORDER.filter((field) => !present.has(field));
  return {
    mode: sections.length ? "structured" : "prose",
    present: orderedPresent,
    missing,
    score: Math.round((orderedPresent.length / FIELD_ORDER.length) * 100),
  };
}
