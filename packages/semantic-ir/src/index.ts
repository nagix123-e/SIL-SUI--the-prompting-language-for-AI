import { z } from "zod";

export const SIL_VERSION = "0.1";
export const MAX_SOURCE_LENGTH = 100_000;

export type SourceLanguage = "ja" | "en" | "unknown";
export type StatementKind =
  | "goal"
  | "target"
  | "action"
  | "input"
  | "output"
  | "require"
  | "prefer"
  | "forbid"
  | "verify"
  | "on_failure";

export interface SourceLocation {
  line: number;
  column: number;
}

export interface AstStatement {
  kind: StatementKind;
  value: string;
  location: SourceLocation;
}

export interface TaskAst {
  type: "Task";
  name: string;
  statements: AstStatement[];
  location: SourceLocation;
}

export interface SemanticIR {
  version: string;
  taskId: string;
  goal?: string;
  target?: string;
  action?: string;
  inputs: string[];
  outputs: string[];
  required: string[];
  preferred: string[];
  forbidden: string[];
  verification: string[];
  failureHandling: string[];
  metadata?: {
    sourceLanguage?: SourceLanguage;
    confidence?: number;
    warnings?: string[];
  };
}

export interface CodebookEntry {
  id: string;
  namespace: string;
  key: string;
  code: string;
  description: string;
  aliases: string[];
  version: string;
  status: "active" | "deprecated";
}

export interface Codebook {
  version: string;
  entries: CodebookEntry[];
}

export type DiagnosticSeverity = "error" | "warning";

export interface Diagnostic {
  severity: DiagnosticSeverity;
  code: string;
  message: string;
  path?: string;
  line?: number;
  column?: number;
}

export const semanticIrSchema = z.object({
  version: z.string().min(1),
  taskId: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/),
  goal: z.string().optional(),
  target: z.string().optional(),
  action: z.string().optional(),
  inputs: z.array(z.string()),
  outputs: z.array(z.string()),
  required: z.array(z.string()),
  preferred: z.array(z.string()),
  forbidden: z.array(z.string()),
  verification: z.array(z.string()),
  failureHandling: z.array(z.string()),
  metadata: z
    .object({
      sourceLanguage: z.enum(["ja", "en", "unknown"]).optional(),
      confidence: z.number().min(0).max(1).optional(),
      warnings: z.array(z.string()).optional(),
    })
    .optional(),
});

export const codebookEntrySchema = z.object({
  id: z.string().min(1),
  namespace: z.string().min(1),
  key: z.string().min(1),
  code: z.string().regex(/^[A-Z][A-Z0-9]*$/),
  description: z.string().min(1),
  aliases: z.array(z.string()).default([]),
  version: z.string().min(1),
  status: z.enum(["active", "deprecated"]),
});

export const codebookSchema = z.object({
  version: z.string().min(1),
  entries: z.array(codebookEntrySchema),
});

export function emptyIr(taskId = "UntitledTask"): SemanticIR {
  return {
    version: SIL_VERSION,
    taskId,
    inputs: [],
    outputs: [],
    required: [],
    preferred: [],
    forbidden: [],
    verification: [],
    failureHandling: [],
  };
}
