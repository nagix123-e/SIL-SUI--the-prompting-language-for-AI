import {
  MAX_SOURCE_LENGTH,
  type AstStatement,
  type SemanticIR,
  type StatementKind,
  type TaskAst,
  emptyIr,
} from "../../semantic-ir/src/index";

const statementKinds = new Set<StatementKind>([
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
]);

const semanticRefPattern = /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)*$/;
const identifierPattern = /^[A-Za-z][A-Za-z0-9_]*$/;

export class SilSyntaxError extends Error {
  constructor(
    message: string,
    public readonly line: number,
    public readonly column: number,
  ) {
    super(`${message} (${line}:${column})`);
    this.name = "SilSyntaxError";
  }
}

function withoutComment(line: string): string {
  const index = line.indexOf("//");
  return index === -1 ? line : line.slice(0, index);
}

export function tokenize(source: string): AstStatement[] {
  return parseSil(source).statements;
}

export function parseSil(source: string): TaskAst {
  if (source.length > MAX_SOURCE_LENGTH) {
    throw new SilSyntaxError(
      `Source exceeds the ${MAX_SOURCE_LENGTH.toLocaleString()} character limit`,
      1,
      1,
    );
  }

  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  let startIndex = -1;
  let taskName = "";

  for (let index = 0; index < lines.length; index += 1) {
    const text = withoutComment(lines[index]).trim();
    if (!text) continue;
    const match = /^task\s+([^\s{]+)\s*\{\s*$/.exec(text);
    if (!match) {
      throw new SilSyntaxError('Expected "task Identifier {"', index + 1, 1);
    }
    taskName = match[1];
    if (!identifierPattern.test(taskName)) {
      throw new SilSyntaxError(`Invalid task identifier "${taskName}"`, index + 1, 6);
    }
    startIndex = index;
    break;
  }

  if (startIndex === -1) {
    throw new SilSyntaxError("Expected a task definition", 1, 1);
  }

  const statements: AstStatement[] = [];
  let closed = false;

  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const raw = withoutComment(lines[index]);
    const text = raw.trim();
    if (!text) continue;

    if (text === "}") {
      closed = true;
      for (let tail = index + 1; tail < lines.length; tail += 1) {
        if (withoutComment(lines[tail]).trim()) {
          throw new SilSyntaxError("Unexpected content after task", tail + 1, 1);
        }
      }
      break;
    }

    const match = /^([a-z_]+)\s*:\s*([^;\s]+)\s*;?\s*$/.exec(text);
    if (!match) {
      throw new SilSyntaxError('Expected "field: semantic.reference"', index + 1, raw.search(/\S/) + 1);
    }

    const kind = match[1] as StatementKind;
    if (!statementKinds.has(kind)) {
      throw new SilSyntaxError(`Unknown statement "${match[1]}"`, index + 1, raw.indexOf(match[1]) + 1);
    }
    if (!semanticRefPattern.test(match[2])) {
      throw new SilSyntaxError(`Invalid semantic reference "${match[2]}"`, index + 1, raw.indexOf(match[2]) + 1);
    }

    statements.push({
      kind,
      value: match[2],
      location: { line: index + 1, column: raw.indexOf(match[1]) + 1 },
    });
  }

  if (!closed) {
    throw new SilSyntaxError('Expected closing "}"', lines.length, Math.max(1, lines.at(-1)?.length ?? 1));
  }

  return {
    type: "Task",
    name: taskName,
    statements,
    location: { line: startIndex + 1, column: 1 },
  };
}

export function astToIr(ast: TaskAst): SemanticIR {
  const ir = emptyIr(ast.name);
  const many: Partial<Record<StatementKind, keyof SemanticIR>> = {
    input: "inputs",
    output: "outputs",
    require: "required",
    prefer: "preferred",
    forbid: "forbidden",
    verify: "verification",
    on_failure: "failureHandling",
  };

  for (const statement of ast.statements) {
    if (statement.kind === "goal" || statement.kind === "target" || statement.kind === "action") {
      ir[statement.kind] ??= statement.value;
      continue;
    }
    const field = many[statement.kind];
    if (field) {
      (ir[field] as string[]).push(statement.value);
    }
  }
  return ir;
}

export function formatIr(ir: SemanticIR): string {
  const lines = [`task ${ir.taskId} {`];
  const single: Array<[string, string | undefined]> = [
    ["goal", ir.goal],
    ["target", ir.target],
    ["action", ir.action],
  ];
  const many: Array<[string, string[]]> = [
    ["input", ir.inputs],
    ["output", ir.outputs],
    ["require", ir.required],
    ["prefer", ir.preferred],
    ["forbid", ir.forbidden],
    ["verify", ir.verification],
    ["on_failure", ir.failureHandling],
  ];

  for (const [key, value] of single) {
    if (value) lines.push(`  ${key}: ${value}`);
  }
  for (const [key, values] of many) {
    for (const value of values) lines.push(`  ${key}: ${value}`);
  }
  lines.push("}");
  return `${lines.join("\n")}\n`;
}

export function formatSil(source: string): string {
  return formatIr(astToIr(parseSil(source)));
}
