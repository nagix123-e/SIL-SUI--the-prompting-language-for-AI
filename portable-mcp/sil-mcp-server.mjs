#!/usr/bin/env node

/**
 * Portable SIL/SUI MCP server.
 *
 * No DSL content is executed here. The server only invokes the local SIL CLI
 * with inline source, so an HTTP client cannot use this service as a local
 * file reader or shell runner.
 */
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { access, chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const SERVER_VERSION = "0.4.0";
const DEFAULT_PROTOCOL_VERSION = "2025-06-18";
const SUPPORTED_PROTOCOL_VERSIONS = new Set(["2025-06-18", "2025-11-25"]);
const MAX_SOURCE_LENGTH = 512_000;
const MAX_QUERY_LENGTH = 500;
const MAX_OUTPUT_LENGTH = 8_000_000;
const MAX_HTTP_BODY_LENGTH = 1_000_000;
const COMMANDS = new Set(["parse", "validate", "compile", "quantize", "dequantize", "format", "migrate", "graph", "patch", "inspect", "readiness", "assess-result"]);
const NAMESPACES = new Set(["goal", "target", "action", "input", "output", "require", "prefer", "forbid", "verify", "on_failure"]);
const kitRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runtimeDirectory = path.resolve(process.env.SIL_MCP_RUNTIME_DIR || path.join(kitRoot, "portable-mcp", ".runtime"));
const runtimeConfigPath = path.join(runtimeDirectory, "local.json");

const runSilTool = {
  name: "run_sil",
  title: "Run SIL/SUI compiler operation",
  description: "Parse, validate, compile, format, migrate, inspect, graph, patch, quantify, and assess SIL/SUI v0.1-v0.4. This tool treats SIL/SUI as data and never executes the described task.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      command: { type: "string", enum: [...COMMANDS], description: "SIL/SUI operation." },
      source: { type: "string", maxLength: MAX_SOURCE_LENGTH, description: "Inline SIL, SUI, natural-language instruction, or quantized SIL code. File paths are deliberately not accepted." },
      json: { type: "boolean", default: false, description: "With compile, return canonical Semantic IR JSON." },
      rawPrompt: { type: "boolean", default: false, description: "With compile, return the unguarded model-independent prompt." },
      compact: { type: "boolean", default: false, description: "With quantize, use compact encoding." },
      legacy: { type: "boolean", default: false, description: "With format, request legacy brace output." },
      patch: { type: "array", description: "For patch, atomic Patch operations against stable IDs." },
      dryRun: { type: "boolean", default: false, description: "For patch, preview without replacing caller content." },
      evidence: { type: "array", description: "For assess-result, observed post-execution evidence. Agent self-report is insufficient." },
      capabilities: { type: "object", description: "For assess-result, environment capability map." },
      suiSource: { type: "string", maxLength: MAX_SOURCE_LENGTH, description: "For validation, optional companion SUI source." }
    },
    required: ["command", "source"]
  }
};

const searchPresetsTool = {
  name: "search_sil_presets",
  title: "Search SIL semantic presets",
  description: "Search the deterministic Core v0.1 codebook of 10,000 active English semantic presets.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      query: { type: "string", minLength: 1, maxLength: MAX_QUERY_LENGTH },
      namespace: { type: "string", enum: [...NAMESPACES] },
      limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
      offset: { type: "integer", minimum: 0, default: 0 }
    },
    required: ["query"]
  }
};

function rpcResult(id, result) { return { jsonrpc: "2.0", id, result }; }
function rpcError(id, code, message, data) {
  const error = { code, message };
  if (data !== undefined) error.data = data;
  return { jsonrpc: "2.0", id: id ?? null, error };
}
function writeMessage(message) { process.stdout.write(`${JSON.stringify(message)}\n`); }

async function resolveSilProject() {
  const projectRoot = path.resolve(process.env.SIL_PROJECT_ROOT || kitRoot);
  const packagePath = path.join(projectRoot, "package.json");
  const cliPath = path.join(projectRoot, "apps", "cli", "src", "index.ts");
  await access(cliPath);
  const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
  if (packageJson.name !== "semantic-instruction-language") throw new Error("The configured SIL project is not a portable SIL/SUI kit.");
  return { projectRoot, cliPath };
}

function integerArgument(value, fallback, minimum, maximum, name) {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved < minimum || resolved > maximum) throw new Error(`${name} must be an integer between ${minimum} and ${maximum}.`);
  return resolved;
}

function validateRunArguments(args) {
  if (!args || typeof args !== "object" || Array.isArray(args)) throw new Error("Tool arguments must be an object.");
  if (!COMMANDS.has(args.command)) throw new Error(`Unsupported command: ${String(args.command)}`);
  if (typeof args.source !== "string") throw new Error("Provide inline source. inputPath is intentionally unavailable through the portable MCP service.");
  if (args.source.length > MAX_SOURCE_LENGTH) throw new Error(`Source exceeds the ${MAX_SOURCE_LENGTH}-character SIL limit.`);
  if (args.json && args.command !== "compile") throw new Error("json is only valid with compile.");
  if (args.rawPrompt && args.command !== "compile") throw new Error("rawPrompt is only valid with compile.");
  if (args.json && args.rawPrompt) throw new Error("json and rawPrompt cannot be used together.");
  if (args.compact && args.command !== "quantize") throw new Error("compact is only valid with quantize.");
  if (args.legacy && args.command !== "format") throw new Error("legacy is only valid with format.");
  if (args.patch !== undefined && args.command !== "patch") throw new Error("patch is only valid with patch.");
  if (args.dryRun && args.command !== "patch") throw new Error("dryRun is only valid with patch.");
  if (args.command === "patch" && !Array.isArray(args.patch)) throw new Error("patch requires a Patch-operation array.");
  if (args.evidence !== undefined && args.command !== "assess-result") throw new Error("evidence is only valid with assess-result.");
  if (args.capabilities !== undefined && args.command !== "assess-result") throw new Error("capabilities is only valid with assess-result.");
  if (args.command === "assess-result" && !Array.isArray(args.evidence)) throw new Error("assess-result requires an evidence array.");
  if (args.suiSource !== undefined && args.command !== "validate") throw new Error("suiSource is only valid with validate.");
}

function validateSearchArguments(args) {
  if (!args || typeof args !== "object" || Array.isArray(args) || typeof args.query !== "string" || !args.query.trim()) throw new Error("query must be a non-empty string.");
  if (args.query.length > MAX_QUERY_LENGTH) throw new Error(`query exceeds ${MAX_QUERY_LENGTH} characters.`);
  if (args.namespace !== undefined && !NAMESPACES.has(args.namespace)) throw new Error(`Unsupported namespace: ${String(args.namespace)}`);
  return { query: args.query.trim(), namespace: args.namespace, limit: integerArgument(args.limit, 20, 1, 100, "limit"), offset: integerArgument(args.offset, 0, 0, Number.MAX_SAFE_INTEGER, "offset") };
}

async function executeCli(arguments_, stdin) {
  const { projectRoot, cliPath } = await resolveSilProject();
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["--import", "tsx", cliPath, ...arguments_], { cwd: projectRoot, env: process.env, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = ""; let stderr = ""; let outputTooLarge = false; let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill("SIGTERM"); }, 30_000);
    const append = (current, chunk) => {
      const next = current + chunk.toString("utf8");
      if (next.length > MAX_OUTPUT_LENGTH) { outputTooLarge = true; child.kill("SIGTERM"); return next.slice(0, MAX_OUTPUT_LENGTH); }
      return next;
    };
    child.stdout.on("data", (chunk) => { stdout = append(stdout, chunk); });
    child.stderr.on("data", (chunk) => { stderr = append(stderr, chunk); });
    child.on("error", (error) => { clearTimeout(timer); resolve({ exitCode: null, stdout, stderr: `${stderr}${error.message}`, failed: true }); });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      const reason = timedOut ? "SIL operation timed out after 30 seconds." : outputTooLarge ? `SIL output exceeded the ${MAX_OUTPUT_LENGTH}-character limit.` : signal ? `SIL process ended with signal ${signal}.` : "";
      resolve({ exitCode: code, stdout, stderr: [stderr.trimEnd(), reason].filter(Boolean).join("\n"), failed: code !== 0 || Boolean(signal) || timedOut || outputTooLarge });
    });
    child.stdin.end(stdin, "utf8");
  });
}

async function runSil(args) {
  validateRunArguments(args);
  const cliArgs = [args.command, "-"];
  if (args.json) cliArgs.push("--json");
  if (args.rawPrompt) cliArgs.push("--raw-prompt");
  if (args.compact) cliArgs.push("--compact");
  if (args.legacy) cliArgs.push("--legacy");
  if (args.command === "patch") { cliArgs.push("--patch-json", JSON.stringify(args.patch)); if (args.dryRun) cliArgs.push("--dry-run"); }
  if (args.command === "assess-result") { cliArgs.push("--evidence-json", JSON.stringify(args.evidence)); if (args.capabilities !== undefined) cliArgs.push("--capabilities-json", JSON.stringify(args.capabilities)); }
  if (args.suiSource !== undefined) cliArgs.push("--sui-source", args.suiSource);
  return executeCli(cliArgs, args.source);
}

async function searchPresets(args) {
  const validated = validateSearchArguments(args);
  const cliArgs = ["codebook", "search", validated.query, "--limit", String(validated.limit), "--offset", String(validated.offset)];
  if (validated.namespace) cliArgs.push("--namespace", validated.namespace);
  return executeCli(cliArgs, "");
}

function toolResult(operation, result) { return { content: [{ type: "text", text: JSON.stringify({ operation, exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr }, null, 2) }], isError: result.failed }; }
async function callTool(params) {
  if (params?.name === "run_sil") return toolResult(params.arguments?.command, await runSil(params.arguments ?? {}));
  if (params?.name === "search_sil_presets") return toolResult("codebook.search", await searchPresets(params.arguments ?? {}));
  throw new Error(`Unknown tool: ${String(params?.name)}`);
}

async function handleMessage(message) {
  const { id, method, params } = message;
  if (method === "initialize") {
    const requested = params?.protocolVersion;
    const protocolVersion = SUPPORTED_PROTOCOL_VERSIONS.has(requested) ? requested : DEFAULT_PROTOCOL_VERSION;
    return rpcResult(id, { protocolVersion, capabilities: { tools: {} }, serverInfo: { name: "sil-sui-mcp", version: SERVER_VERSION } });
  }
  if (method === "ping") return rpcResult(id, {});
  if (method === "tools/list") return rpcResult(id, { tools: [runSilTool, searchPresetsTool] });
  if (method === "tools/call") return rpcResult(id, await callTool(params));
  if (method?.startsWith("notifications/")) return null;
  return rpcError(id, -32601, `Method not found: ${String(method)}`);
}

async function readRuntimeConfig() {
  const config = JSON.parse(await readFile(runtimeConfigPath, "utf8"));
  if (typeof config.token !== "string" || config.token.length < 32) throw new Error("Local MCP token is invalid. Run init again.");
  return config;
}

async function initializeRuntime() {
  await mkdir(runtimeDirectory, { recursive: true, mode: 0o700 });
  try { await readFile(runtimeConfigPath, "utf8"); throw new Error(`Runtime already exists: ${runtimeConfigPath}`); } catch (error) { if (error?.code !== "ENOENT") throw error; }
  const config = { token: randomBytes(32).toString("base64url"), createdAt: new Date().toISOString() };
  await writeFile(runtimeConfigPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  await chmod(runtimeConfigPath, 0o600);
  return config;
}

function parseServeOptions(args) {
  let host = "127.0.0.1"; let port = 8765;
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === "--host") host = args[++index] ?? "";
    else if (value === "--port") port = Number(args[++index]);
    else throw new Error(`Unknown serve option: ${value}`);
  }
  if (!["127.0.0.1", "::1", "localhost"].includes(host)) throw new Error("The portable service binds only to loopback. Use a separate, explicitly secured deployment for network access.");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("port must be an integer between 1 and 65535.");
  return { host, port };
}

function unauthorized(response) {
  response.writeHead(401, { "Content-Type": "application/json", "WWW-Authenticate": "Bearer" });
  response.end(JSON.stringify(rpcError(null, -32001, "Unauthorized local MCP request.")));
}

async function readHttpBody(request) {
  const chunks = []; let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > MAX_HTTP_BODY_LENGTH) throw new Error(`HTTP request exceeds the ${MAX_HTTP_BODY_LENGTH}-byte limit.`);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function serve(args) {
  const { host, port } = parseServeOptions(args);
  const { token } = await readRuntimeConfig();
  const service = createServer(async (request, response) => {
    if (request.url !== "/mcp") { response.writeHead(404).end(); return; }
    if (request.method !== "POST") { response.writeHead(405, { Allow: "POST" }).end(); return; }
    if (request.headers.authorization !== `Bearer ${token}`) { unauthorized(response); return; }
    try {
      const message = JSON.parse(await readHttpBody(request));
      const result = await handleMessage(message);
      response.setHeader("Content-Type", "application/json");
      response.setHeader("Cache-Control", "no-store");
      response.setHeader("MCP-Protocol-Version", SUPPORTED_PROTOCOL_VERSIONS.has(message?.params?.protocolVersion) ? message.params.protocolVersion : DEFAULT_PROTOCOL_VERSION);
      response.writeHead(result ? 200 : 202);
      response.end(result ? JSON.stringify(result) : undefined);
    } catch (error) {
      response.writeHead(400, { "Content-Type": "application/json" });
      response.end(JSON.stringify(rpcError(null, -32700, error instanceof Error ? error.message : String(error))));
    }
  });
  await new Promise((resolve, reject) => { service.once("error", reject); service.listen(port, host, resolve); });
  process.stderr.write(`SIL/SUI MCP listening at http://${host}:${port}/mcp\n`);
}

async function printConfig(args) {
  const transport = args[0] ?? "http";
  if (!["http", "stdio"].includes(transport)) throw new Error("config accepts http or stdio.");
  if (transport === "stdio") {
    console.log(JSON.stringify({ mcpServers: { "sil-sui": { command: process.execPath, args: [path.join(kitRoot, "portable-mcp", "sil-mcp-server.mjs")], cwd: kitRoot } } }, null, 2));
    return;
  }
  const { token } = await readRuntimeConfig();
  console.log(JSON.stringify({ mcpServers: { "sil-sui": { url: "http://127.0.0.1:8765/mcp", headers: { Authorization: `Bearer ${token}` } } } }, null, 2));
}

function runStdio() {
  const lines = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  lines.on("line", async (line) => {
    if (!line.trim()) return;
    let message;
    try { message = JSON.parse(line); } catch (error) { writeMessage(rpcError(null, -32700, "Parse error", error instanceof Error ? error.message : String(error))); return; }
    try { const response = await handleMessage(message); if (response) writeMessage(response); }
    catch (error) { writeMessage(rpcError(message.id, -32603, error instanceof Error ? error.message : String(error))); }
  });
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === "stdio") { runStdio(); return; }
  if (command === "init") { const config = await initializeRuntime(); console.log(JSON.stringify({ runtimeConfig: runtimeConfigPath, token: config.token }, null, 2)); return; }
  if (command === "serve") { await serve(args); return; }
  if (command === "config") { await printConfig(args); return; }
  if (command === "help" || command === "--help" || command === "-h") { console.log("Usage: sil-mcp-server.mjs [stdio|init|serve [--host 127.0.0.1] [--port 8765]|config [http|stdio]]"); return; }
  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
