import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, stat, writeFile, copyFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { TECHNICAL_TERMS, coreCodebook } from "../packages/codebook/src/index";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const releaseDirectory = fileURLToPath(new URL("../releases/", import.meta.url));
const packageName = "sil-sui-writer-gpt-knowledge-set-v0.5-2026-08-03";
const packageDirectory = `${releaseDirectory}${packageName}`;
const zipPath = `${releaseDirectory}${packageName}.zip`;

await rm(packageDirectory, { recursive: true, force: true });
await rm(zipPath, { force: true });
await mkdir(`${packageDirectory}/knowledge`, { recursive: true });
await mkdir(`${packageDirectory}/data`, { recursive: true });

await copyFile(`${repositoryRoot}gpt-base-instructions.txt`, `${packageDirectory}/SYSTEM-INSTRUCTIONS.txt`);
await copyFile(`${repositoryRoot}gpt-knowledge/PACKAGE-README.md`, `${packageDirectory}/README.md`);
await copyFile(`${repositoryRoot}codebooks/core-v0.1.json`, `${packageDirectory}/data/core-v0.1.json`);

const knowledgeFiles = (await readdir(`${repositoryRoot}gpt-knowledge`))
  .filter((name) => /^\d{2}-.+\.md$/u.test(name))
  .sort();
for (const name of knowledgeFiles) {
  await copyFile(`${repositoryRoot}gpt-knowledge/${name}`, `${packageDirectory}/knowledge/${name}`);
}

async function packageFiles(directory: string, prefix = ""): Promise<string[]> {
  const result: string[] = [];
  for (const name of (await readdir(directory)).sort()) {
    const absolutePath = `${directory}/${name}`;
    const relativePath = prefix ? `${prefix}/${name}` : name;
    const info = await stat(absolutePath);
    if (info.isDirectory()) result.push(...await packageFiles(absolutePath, relativePath));
    else result.push(relativePath);
  }
  return result;
}

const contents = await packageFiles(packageDirectory);
const files = await Promise.all(contents.map(async (relativePath) => {
  const bytes = await readFile(`${packageDirectory}/${relativePath}`);
  return {
    path: relativePath,
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}));

const manifest = {
  package: "SIL/SUI Writer GPT Knowledge Set",
  languageVersion: "0.5",
  silVersion: coreCodebook.version,
  buildDate: "2026-08-03",
  naturalLanguage: "multilingual-to-en",
  knowledgeFiles: knowledgeFiles.length,
  codebookEntries: coreCodebook.entries.length,
  technicalTerms: TECHNICAL_TERMS.length,
  contents: files,
};
await writeFile(`${packageDirectory}/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

const zipped = spawnSync("/usr/bin/zip", ["-qr", zipPath, packageName], {
  cwd: releaseDirectory,
  encoding: "utf8",
});
if (zipped.status !== 0) {
  throw new Error(zipped.stderr || `zip exited with status ${zipped.status ?? "unknown"}`);
}

const zipBytes = await readFile(zipPath);
console.log(JSON.stringify({
  zipPath,
  zipBytes: zipBytes.length,
  zipSha256: createHash("sha256").update(zipBytes).digest("hex"),
  knowledgeFiles: knowledgeFiles.length,
  codebookEntries: coreCodebook.entries.length,
  technicalTerms: TECHNICAL_TERMS.length,
}, null, 2));
