import { findEntry } from "../../codebook/src/index";
import {
  semanticIrSchema,
  type Codebook,
  type Diagnostic,
  type SemanticIR,
  type StatementKind,
  type TaskAst,
} from "../../semantic-ir/src/index";

const fieldNamespaces: Array<[keyof SemanticIR, string]> = [
  ["goal", "goal"],
  ["target", "target"],
  ["action", "action"],
  ["inputs", "input"],
  ["outputs", "output"],
  ["required", "require"],
  ["preferred", "prefer"],
  ["forbidden", "forbid"],
  ["verification", "verify"],
  ["failureHandling", "on_failure"],
];

export interface ValidationResult {
  valid: boolean;
  diagnostics: Diagnostic[];
}

export type UnregisteredReferenceKind = "proper_noun" | "verb" | "noun";

export interface UnregisteredSemanticMarker {
  namespace: StatementKind;
  reference: string;
  marker: `extension.${UnregisteredReferenceKind}`;
  kind: UnregisteredReferenceKind;
  interpretation: string;
}

const properNameScope = /^(?:ui_spec|library|framework|platform|model|provider|service|component|package|plugin)\./u;

/**
 * Classifies unknown references without claiming that they equal a core preset.
 * The original reference remains the source of truth and is preserved by the
 * lossless quantizer; the marker gives a downstream runner a safe generic role.
 */
export function interpretUnregisteredReference(namespace: StatementKind, reference: string, codebook: Codebook): UnregisteredSemanticMarker | undefined {
  if (findEntry(codebook, namespace, reference)) return undefined;
  const properNoun = properNameScope.test(reference) || /[A-Z0-9]/u.test(reference);
  const kind: UnregisteredReferenceKind = namespace === "action"
    ? "verb"
    : properNoun
      ? "proper_noun"
      : "noun";
  const interpretation = kind === "verb"
    ? "Unregistered operation; preserve its literal action and require an explicit definition before execution."
    : kind === "proper_noun"
      ? "Unregistered proper-name context; preserve its literal spelling and resolve it only from supplied contracts or repository context."
      : "Unregistered domain noun; preserve it as lossless context without inferring an equivalent core preset.";
  return { namespace, reference, marker: `extension.${kind}`, kind, interpretation };
}

export function interpretUnregisteredReferences(ir: SemanticIR, codebook: Codebook): UnregisteredSemanticMarker[] {
  const markers: UnregisteredSemanticMarker[] = [];
  for (const [field, namespace] of fieldNamespaces) {
    const raw = ir[field];
    const refs = typeof raw === "string" ? [raw] : Array.isArray(raw) ? raw : [];
    for (const reference of refs) {
      const marker = interpretUnregisteredReference(namespace as StatementKind, reference, codebook);
      if (marker) markers.push(marker);
    }
  }
  return markers;
}

export function validateAst(ast: TaskAst): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const field of ["goal", "target", "action"] as const) {
    const statements = ast.statements.filter((statement) => statement.kind === field);
    if (statements.length > 1) {
      const duplicate = statements[1];
      diagnostics.push({
        severity: "warning",
        code: "duplicate-singleton",
        message: `Only the first ${field} is used; remove the duplicate value "${duplicate.value}".`,
        path: field,
        line: duplicate.location.line,
        column: duplicate.location.column,
      });
    }
  }
  return diagnostics;
}

export function validateIr(ir: SemanticIR, codebook: Codebook): ValidationResult {
  const diagnostics: Diagnostic[] = [];
  const parsed = semanticIrSchema.safeParse(ir);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      diagnostics.push({
        severity: "error",
        code: "invalid-ir",
        message: issue.message,
        path: issue.path.join("."),
      });
    }
  }

  if (!ir.goal) {
    diagnostics.push({ severity: "error", code: "missing-goal", message: "A task must declare a goal.", path: "goal" });
  }
  if (!ir.target) {
    diagnostics.push({ severity: "warning", code: "missing-target", message: "No target is declared.", path: "target" });
  }
  if (!ir.action) {
    diagnostics.push({ severity: "warning", code: "missing-action", message: "No action is declared.", path: "action" });
  }
  if (ir.version !== codebook.version) {
    diagnostics.push({
      severity: "error",
      code: "version-mismatch",
      message: `IR version ${ir.version} does not match codebook version ${codebook.version}.`,
      path: "version",
    });
  }

  for (const [field, namespace] of fieldNamespaces) {
    const raw = ir[field];
    const refs = typeof raw === "string" ? [raw] : Array.isArray(raw) ? raw : [];
    const seen = new Set<string>();
    for (const ref of refs) {
      if (seen.has(ref)) {
        diagnostics.push({
          severity: "warning",
          code: "duplicate-reference",
          message: `Duplicate ${namespace} reference "${ref}".`,
          path: String(field),
        });
      }
      seen.add(ref);
      if (!findEntry(codebook, namespace, ref)) {
        const marker = interpretUnregisteredReference(namespace as StatementKind, ref, codebook)!;
        diagnostics.push({
          severity: "warning",
          code: "unknown-reference",
          message: `Unknown ${namespace} reference "${ref}" is marked ${marker.marker} and preserved in lossless mode. ${marker.interpretation}`,
          path: String(field),
        });
      }
    }
  }

  const forbidden = new Set(ir.forbidden);
  for (const ref of ir.required) {
    if (forbidden.has(ref)) {
      diagnostics.push({
        severity: "error",
        code: "conflicting-reference",
        message: `"${ref}" is both required and forbidden.`,
        path: "required",
      });
    }
  }

  return {
    valid: !diagnostics.some((diagnostic) => diagnostic.severity === "error"),
    diagnostics,
  };
}

export function calculateConfidence(ir: SemanticIR, diagnostics: Diagnostic[]): number {
  const coverage = [ir.goal, ir.target, ir.action].filter(Boolean).length / 3;
  const unknownCount = diagnostics.filter((item) => item.code === "unknown-reference").length;
  const errorCount = diagnostics.filter((item) => item.severity === "error").length;
  return Math.max(0, Math.min(1, 0.55 + coverage * 0.35 - unknownCount * 0.04 - errorCount * 0.2));
}
