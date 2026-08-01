import { MAX_SOURCE_LENGTH, type Diagnostic } from "../../semantic-ir/src/index";
export { SUI_BLOCKS, SUI_BLOCK_FIELDS, SUI_BLOCK_FIELD_LABELS, suggestSuiBlocks } from "./blocks";
export type { SuiBlock, SuggestedSuiBlock } from "./blocks";

export const SUI_FIELDS = [
  "screen", "layout", "component", "content", "style", "interaction", "constraint", "state", "verify", "on_failure",
] as const;
export type SuiField = (typeof SUI_FIELDS)[number];

export interface SuiStatement { kind: SuiField; value: string; line: number; column: number; }
export interface SuiAst { type: "Ui"; name: string; statements: SuiStatement[]; }
export interface SuiIR {
  version: "0.1";
  name: string;
  screen?: string;
  layouts: string[];
  components: string[];
  content: string[];
  styles: string[];
  interactions: string[];
  constraints: string[];
  states: string[];
  verification: string[];
  failureHandling: string[];
}
export interface SuiValidationResult { valid: boolean; diagnostics: Diagnostic[]; }

const fields = new Set<string>(SUI_FIELDS);
const identifier = /^[A-Za-z][A-Za-z0-9_]*$/;
const ref = /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)*$/;

export class SuiSyntaxError extends Error {
  constructor(message: string, public readonly line: number, public readonly column: number) {
    super(`${message} (${line}:${column})`);
    this.name = "SuiSyntaxError";
  }
}

function clean(line: string): string { return line.slice(0, line.indexOf("//") === -1 ? line.length : line.indexOf("//")); }

export function parseSui(source: string): SuiAst {
  if (source.length > MAX_SOURCE_LENGTH) throw new SuiSyntaxError(`Source exceeds the ${MAX_SOURCE_LENGTH.toLocaleString()} character limit`, 1, 1);
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  let start = -1;
  let name = "";
  for (let index = 0; index < lines.length; index += 1) {
    const text = clean(lines[index]).trim();
    if (!text) continue;
    const match = /^ui\s+([^\s{]+)\s*\{\s*$/.exec(text);
    if (!match) throw new SuiSyntaxError('Expected "ui Identifier {"', index + 1, 1);
    if (!identifier.test(match[1])) throw new SuiSyntaxError(`Invalid UI identifier "${match[1]}"`, index + 1, 4);
    name = match[1]; start = index; break;
  }
  if (start === -1) throw new SuiSyntaxError("Expected a UI definition", 1, 1);
  const statements: SuiStatement[] = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const raw = clean(lines[index]); const text = raw.trim();
    if (!text) continue;
    if (text === "}") {
      if (lines.slice(index + 1).some((line) => clean(line).trim())) throw new SuiSyntaxError("Unexpected content after UI definition", index + 2, 1);
      return { type: "Ui", name, statements };
    }
    const match = /^([a-z_]+)\s*:\s*([^;\s]+)\s*;?\s*$/.exec(text);
    if (!match) throw new SuiSyntaxError('Expected "field: semantic.reference"', index + 1, Math.max(1, raw.search(/\S/)) + 1);
    if (!fields.has(match[1])) throw new SuiSyntaxError(`Unknown SUI statement "${match[1]}"`, index + 1, raw.indexOf(match[1]) + 1);
    if (!ref.test(match[2])) throw new SuiSyntaxError(`Invalid semantic reference "${match[2]}"`, index + 1, raw.indexOf(match[2]) + 1);
    statements.push({ kind: match[1] as SuiField, value: match[2], line: index + 1, column: raw.indexOf(match[1]) + 1 });
  }
  throw new SuiSyntaxError('Expected closing "}"', lines.length, Math.max(1, lines.at(-1)?.length ?? 1));
}

export function suiAstToIr(ast: SuiAst): SuiIR {
  const ir: SuiIR = { version: "0.1", name: ast.name, layouts: [], components: [], content: [], styles: [], interactions: [], constraints: [], states: [], verification: [], failureHandling: [] };
  const many: Record<Exclude<SuiField, "screen">, keyof SuiIR> = {
    layout: "layouts", component: "components", content: "content", style: "styles", interaction: "interactions", constraint: "constraints", state: "states", verify: "verification", on_failure: "failureHandling",
  };
  for (const statement of ast.statements) {
    if (statement.kind === "screen") { ir.screen ??= statement.value; continue; }
    (ir[many[statement.kind]] as string[]).push(statement.value);
  }
  return ir;
}

export function validateSui(ast: SuiAst): SuiValidationResult {
  const ir = suiAstToIr(ast); const diagnostics: Diagnostic[] = [];
  if (!ir.screen) diagnostics.push({ severity: "error", code: "missing-screen", message: "A SUI definition must declare one screen.", path: "screen" });
  if (!ir.layouts.length) diagnostics.push({ severity: "warning", code: "missing-layout", message: "No layout relationship is declared.", path: "layout" });
  if (!ir.components.length) diagnostics.push({ severity: "error", code: "missing-component", message: "A SUI definition must declare at least one component.", path: "component" });
  if (!ir.verification.length) diagnostics.push({ severity: "warning", code: "missing-verification", message: "No UI acceptance criterion is declared.", path: "verify" });
  if (!ir.failureHandling.length) diagnostics.push({ severity: "warning", code: "missing-failure-handling", message: "No UI failure policy is declared.", path: "on_failure" });
  if (ast.statements.filter((item) => item.kind === "screen").length > 1) diagnostics.push({ severity: "warning", code: "duplicate-singleton", message: "Only the first screen is used.", path: "screen" });
  return { valid: !diagnostics.some((item) => item.severity === "error"), diagnostics };
}

export function formatSuiIr(ir: SuiIR): string {
  const lines = [`ui ${ir.name} {`];
  const groups: Array<[string, readonly string[]]> = [
    ["layout", ir.layouts], ["component", ir.components], ["content", ir.content], ["style", ir.styles], ["interaction", ir.interactions], ["constraint", ir.constraints], ["state", ir.states], ["verify", ir.verification], ["on_failure", ir.failureHandling],
  ];
  if (ir.screen) lines.push(`  screen: ${ir.screen}`);
  for (const [field, values] of groups) for (const value of values) lines.push(`  ${field}: ${value}`);
  lines.push("}"); return `${lines.join("\n")}\n`;
}

export function formatSui(source: string): string { return formatSuiIr(suiAstToIr(parseSui(source))); }

export function generateSuiPrompt(ir: SuiIR): string {
  const lines = [`UI specification: ${ir.name}`, `Screen: ${ir.screen ?? "unspecified"}`];
  for (const [label, values] of [["Layout", ir.layouts], ["Components", ir.components], ["Content", ir.content], ["Styles", ir.styles], ["Interactions", ir.interactions], ["Constraints", ir.constraints], ["States", ir.states], ["Verification", ir.verification], ["On failure", ir.failureHandling]] as const) if (values.length) lines.push(`\n${label}`, ...values.map((value) => `- ${value}`));
  return `${lines.join("\n")}\n`;
}
