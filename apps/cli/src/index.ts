#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import {
  compile,
  compileSil,
  coreCodebook,
  dequantize,
  formatIr,
  formatSil,
  parseSil,
  quantizeIr,
} from "../../../packages/compiler/src/index";

const HELP = `Semantic Instruction Language CLI

Usage:
  sil parse <task.sil>
  sil validate <task.sil>
  sil compile <instruction.txt|task.sil> [--json]
  sil quantize <task.sil> [--compact]
  sil dequantize <code|file.sq>
  sil format <task.sil>

Use "-" as the input path to read from stdin.`;

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

async function readInput(value?: string): Promise<string> {
  if (!value) throw new Error("Missing input.\n\n" + HELP);
  if (value === "-") return readStdin();
  if (value.startsWith("@")) return value;
  return readFile(value, "utf8");
}

async function main(): Promise<void> {
  const [, , command, input, ...flags] = process.argv;
  if (!command || command === "help" || command === "--help" || command === "-h") {
    console.log(HELP);
    return;
  }

  const source = await readInput(input);
  switch (command) {
    case "parse":
      console.log(JSON.stringify(parseSil(source), null, 2));
      return;
    case "validate": {
      const result = compileSil(source);
      console.log(JSON.stringify({ valid: result.valid, diagnostics: result.diagnostics }, null, 2));
      if (!result.valid) process.exitCode = 1;
      return;
    }
    case "compile": {
      const result = compile(source);
      if (flags.includes("--json")) console.log(JSON.stringify(result.ir, null, 2));
      else console.log(result.prompt);
      if (result.diagnostics.length) console.error(JSON.stringify(result.diagnostics, null, 2));
      if (!result.valid) process.exitCode = 1;
      return;
    }
    case "quantize": {
      const result = compileSil(source);
      const quantized = quantizeIr(result.ir, coreCodebook, flags.includes("--compact") ? "compact" : "lossless");
      console.log(quantized.code);
      if (quantized.diagnostics.length) console.error(JSON.stringify(quantized.diagnostics, null, 2));
      return;
    }
    case "dequantize": {
      const result = dequantize(source.trim(), coreCodebook);
      console.log(formatIr(result.ir));
      if (result.diagnostics.length) console.error(JSON.stringify(result.diagnostics, null, 2));
      return;
    }
    case "format":
      console.log(formatSil(source));
      return;
    default:
      throw new Error(`Unknown command "${command}".\n\n${HELP}`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
