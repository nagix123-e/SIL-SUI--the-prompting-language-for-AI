#!/usr/bin/env node

import { cp, mkdir, mkdtemp, readFile, rename, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(await readFile(path.join(projectRoot, "package.json"), "utf8"));
const kitName = `sil-sui-mcp-kit-v${packageJson.version}`;
const stagingRoot = await mkdtemp(path.join(tmpdir(), "sil-sui-mcp-kit-"));
const kitRoot = path.join(stagingRoot, kitName);
const releasesRoot = path.join(projectRoot, "releases");
const archivePath = path.join(releasesRoot, `${kitName}.zip`);
const temporaryArchivePath = path.join(stagingRoot, `${kitName}.zip`);

async function copy(relativePath) {
  await cp(path.join(projectRoot, relativePath), path.join(kitRoot, relativePath), { recursive: true, force: true });
}

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: "inherit" });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`)));
  });
}

try {
  await mkdir(kitRoot, { recursive: true });
  for (const source of ["apps/cli", "packages", "codebooks", "portable-mcp", "package.json", "package-lock.json", "tsconfig.json"]) await copy(source);
  await run("zip", ["-qr", temporaryArchivePath, kitName], stagingRoot);
  await mkdir(releasesRoot, { recursive: true });
  await rename(temporaryArchivePath, archivePath);
  console.log(JSON.stringify({ archivePath, kitName, node: packageJson.engines?.node, install: ["npm ci", "npm run mcp -- init", "npm run mcp -- serve"] }, null, 2));
} finally {
  await rm(stagingRoot, { recursive: true, force: true });
}
