import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  CODEBOOK_COLOR_CATEGORY_BY_NAMESPACE,
  CODE_PREFIXES,
  ENTRIES_PER_NAMESPACE,
  TECHNICAL_TERMS,
  coreCodebook,
  coreSeedEntries,
  findEntry,
  findEntryByCode,
  getCodebookStats,
  loadCodebook,
  searchCodebook,
} from "../packages/codebook/src/index";
import { PROMPT_COLOR_CATEGORY, semanticIrSchema, SIL_NAMESPACES } from "../packages/semantic-ir/src/index";
import { compileSil, dequantize } from "../packages/compiler/src/index";

const japaneseScriptPattern = /[\u3000-\u30ff\u3400-\u9fff\uff01-\uff60]/u;

describe("expanded core codebook", () => {
  it("contains exactly 10,000 English presets balanced across namespaces", () => {
    const stats = getCodebookStats(coreCodebook);
    expect(stats.total).toBe(10_000);
    expect(stats.active).toBe(10_000);
    expect(stats.deprecated).toBe(0);
    expect(stats.colored).toBe(10_000);
    expect(stats.unclassified).toBe(0);
    for (const namespace of SIL_NAMESPACES) {
      expect(stats.namespaces[namespace]).toBe(ENTRIES_PER_NAMESPACE);
    }

    for (const entry of coreCodebook.entries) {
      expect(entry.code.startsWith(CODE_PREFIXES[entry.namespace])).toBe(true);
      expect(entry.colorCategory).toBe(CODEBOOK_COLOR_CATEGORY_BY_NAMESPACE[entry.namespace]);
      expect(entry.colorCategory).toBeGreaterThan(0);
      expect(japaneseScriptPattern.test(`${entry.key} ${entry.aliases.join(" ")} ${entry.description}`)).toBe(false);
      expect(findEntryByCode(coreCodebook, entry.code)).toBe(entry);
      expect(findEntry(coreCodebook, entry.namespace, entry.key)).toBe(entry);
      for (const alias of entry.aliases) expect(findEntry(coreCodebook, entry.namespace, alias)).toBe(entry);
    }
  });

  it("preserves every legacy key and token assignment", () => {
    for (const seed of coreSeedEntries) {
      expect(findEntry(coreCodebook, seed.namespace, seed.key)?.code).toBe(seed.code);
    }
  });

  it("registers 100 curated technologies as both targets and context inputs", () => {
    expect(TECHNICAL_TERMS).toHaveLength(100);
    for (const term of TECHNICAL_TERMS) {
      expect(findEntry(coreCodebook, "target", `technology.${term.id}`)).toBeDefined();
      expect(findEntry(coreCodebook, "input", term.contextReference)).toBeDefined();
    }
  });

  it("keeps the generated portable JSON synchronized with runtime data", async () => {
    const json = JSON.parse(await readFile(new URL("../codebooks/core-v0.1.json", import.meta.url), "utf8"));
    expect(json.version).toBe(coreCodebook.version);
    expect(json.entries).toEqual(coreCodebook.entries);
  });

  it("searches canonical keys, aliases, descriptions, codes, and namespaces", () => {
    expect(searchCodebook(coreCodebook, "product search", { namespace: "target", limit: 5 })[0]?.key).toBe("product.search");
    expect(searchCodebook(coreCodebook, "G12", { limit: 1 })[0]?.key).toBe("feature.add");
    expect(searchCodebook(coreCodebook, "account encrypted", { namespace: "require", limit: 5 })).toContainEqual(
      expect.objectContaining({ key: "account.encrypted" }),
    );
    expect(searchCodebook(coreCodebook, "Ollama", { namespace: "target", limit: 1 })[0]).toMatchObject({
      key: "technology.ollama",
      colorCategory: PROMPT_COLOR_CATEGORY.noun,
    });
  });

  it("quantizes and restores generated presets without extension tokens", () => {
    const result = compileSil(`task SecureAccount {
  goal: account.secure
  target: account.service
  action: account.update
  require: account.encrypted
  verify: account.updated
}`);
    expect(result.valid).toBe(true);
    expect(result.quantizedCode).toContain("G10005");
    expect(result.quantizedCode).toContain("T10000");
    expect(result.quantizedCode).toContain("A10002");
    expect(result.quantizedCode).toContain("R10002");
    expect(result.quantizedCode).toContain("V10001");
    expect(result.quantizedCode).not.toContain("~g:");
    expect(dequantize(result.quantizedCode, coreCodebook).ir.required).toContain("account.encrypted");
  });

  it("rejects ambiguous aliases and invalid namespace prefixes", () => {
    const [first, second] = coreCodebook.entries.filter((entry) => entry.namespace === "goal").slice(0, 2);
    expect(() =>
      loadCodebook({
        version: coreCodebook.version,
        entries: [
          { ...first, aliases: ["ambiguous_alias"] },
          { ...second, aliases: ["ambiguous_alias"] },
        ],
      }),
    ).toThrow("Duplicate goal reference");
    expect(() => loadCodebook({ version: coreCodebook.version, entries: [{ ...first, code: "T99999" }] })).toThrow(
      "does not match the goal namespace prefix",
    );
  });

  it("defaults a custom entry without a defensible category to unclassified", () => {
    const withoutColorCategory = Object.fromEntries(
      Object.entries(coreCodebook.entries[0]!).filter(([key]) => key !== "colorCategory"),
    );
    const custom = loadCodebook({ version: coreCodebook.version, entries: [withoutColorCategory] });
    expect(custom.entries[0]?.colorCategory).toBe(0);
  });

  it("does not accept Japanese source-language metadata", () => {
    expect(
      semanticIrSchema.safeParse({
        version: "0.1",
        taskId: "Demo",
        inputs: [],
        outputs: [],
        required: [],
        preferred: [],
        forbidden: [],
        verification: [],
        failureHandling: [],
        metadata: { sourceLanguage: "ja" },
      }).success,
    ).toBe(false);
  });
});
