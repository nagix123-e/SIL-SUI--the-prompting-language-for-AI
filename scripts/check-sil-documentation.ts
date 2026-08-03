import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseSil } from "../packages/parser/src/index";
import { parseV02, validateV02 } from "../packages/v02/src/index";
import { parseSui } from "../packages/sui/src/index";
import { parseV03, validateV03 } from "../packages/v03/src/index";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const knowledgeFiles = (await readdir(`${repositoryRoot}gpt-knowledge`))
  .filter((name) => /^\d{2}-.+\.md$/u.test(name))
  .sort()
  .map((name) => `gpt-knowledge/${name}`);
const documentationFiles = ["SIL-HUMAN-README.md", ...knowledgeFiles];
let examples = 0;

for (const relativePath of documentationFiles) {
  const source = await readFile(`${repositoryRoot}${relativePath}`, "utf8");
  for (const match of source.matchAll(/```(?:sil|sui)\s*\n([\s\S]*?)```/gu)) {
    const dsl = match[1].trim();
    if (!/^(?:task|ui|bundle)\s+/u.test(dsl)) continue;
    if (/^\s*version:\s*0\.(?:3|4|5)\s*$/mu.test(dsl)) {
      const validation = validateV03(parseV03(dsl));
      if (!validation.valid) throw new Error(`Invalid v${parseV03(dsl).version} example in ${relativePath}: ${validation.diagnostics.map((item) => item.message).join(" ")}`);
    } else if (/^\s*version:\s*0\.2\s*$/mu.test(dsl)) {
      const validation = validateV02(parseV02(dsl));
      if (!validation.valid) throw new Error(`Invalid v0.2 example in ${relativePath}: ${validation.diagnostics.map((item) => item.message).join(" ")}`);
    } else if (dsl.startsWith("task ")) parseSil(dsl);
    else parseSui(dsl);
    examples += 1;
  }
}

if (!examples) throw new Error("No complete SIL examples were found.");
console.log(`Validated ${examples} complete SIL examples across ${documentationFiles.length} documentation files.`);
