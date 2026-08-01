import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { coreCodebook, getCodebookStats } from "../packages/codebook/src/index";

const outputUrl = new URL("../codebooks/core-v0.1.json", import.meta.url);
const outputPath = fileURLToPath(outputUrl);
const content = `${JSON.stringify(
  {
    version: coreCodebook.version,
    description: "SIL core English codebook with 10,000 deterministic semantic presets and numeric prompt-color categories.",
    entries: coreCodebook.entries,
  },
  null,
  2,
)}\n`;

if (process.argv.includes("--check")) {
  const existing = await readFile(outputUrl, "utf8");
  if (existing !== content) {
    throw new Error(`${outputPath} is stale. Run npm run codebook:generate.`);
  }
  console.log(`Codebook is current: ${JSON.stringify(getCodebookStats(coreCodebook))}`);
} else {
  await writeFile(outputUrl, content, "utf8");
  console.log(`Wrote ${coreCodebook.entries.length.toLocaleString("en-US")} entries to ${outputPath}`);
}
