import { describe, expect, it } from "vitest";
import { findEntry } from "../packages/codebook/src/index";
import {
  PROMPT_BLOCKS,
  PROMPT_BLOCK_KIND_ORDER,
  coreCodebook,
  highlightPromptText,
  highlightSourceText,
  insertPromptBlockText,
  suggestPromptBlocks,
} from "../packages/compiler/src/index";
import { PROMPT_COLOR_CATEGORY, SIL_NAMESPACES } from "../packages/semantic-ir/src/index";

describe("SIL-aware prompt blocks", () => {
  it("provides a broad, color-groupable vocabulary with unique identifiers", () => {
    expect(PROMPT_BLOCKS.length).toBe(300);
    expect(new Set(PROMPT_BLOCKS.map((block) => block.id)).size).toBe(PROMPT_BLOCKS.length);
    expect(new Set(PROMPT_BLOCKS.map((block) => block.kind))).toEqual(new Set(PROMPT_BLOCK_KIND_ORDER));
    expect(PROMPT_BLOCKS.find((block) => block.id === "grammar-to")).toMatchObject({
      label: "to",
      kind: "grammar",
      roles: [],
      bindings: [],
    });
    expect(PROMPT_BLOCKS.find((block) => block.id === "tech-ollama")).toMatchObject({
      label: "Ollama",
      kind: "noun",
      roles: ["target", "input"],
    });
  });

  it("covers every SIL role with a structural field block", () => {
    const structuralRoles = PROMPT_BLOCKS
      .filter((block) => block.kind === "structure")
      .flatMap((block) => block.roles);
    expect(new Set(structuralRoles)).toEqual(new Set(SIL_NAMESPACES));
  });

  it("uses registered references unless a binding is explicitly lossless", () => {
    for (const block of PROMPT_BLOCKS) {
      for (const binding of block.bindings) {
        if (!binding.reference || binding.lossless) continue;
        expect(
          findEntry(coreCodebook, binding.field, binding.reference),
          `${block.id}: ${binding.field} → ${binding.reference}`,
        ).toBeDefined();
      }
    }
  });

  it("color-classifies known phrases by longest match and leaves unknown text unclassified", () => {
    const tokens = highlightPromptText("Goal: I want to implement API endpoint with JSON object.");
    expect(tokens.map(({ text, kind }) => [text, kind])).toEqual([
      ["Goal:", "structure"],
      [" ", null],
      ["I", "grammar"],
      [" want ", null],
      ["to", "grammar"],
      [" ", null],
      ["implement", "verb"],
      [" ", null],
      ["API endpoint", "noun"],
      [" ", null],
      ["with", "grammar"],
      [" ", null],
      ["JSON object", "data"],
      [".", null],
    ]);
    expect(highlightPromptText("store")).toEqual([{
      text: "store",
      kind: null,
      colorCategory: PROMPT_COLOR_CATEGORY.unclassified,
    }]);
    expect(highlightPromptText("Create account as the task objective")).toEqual([
      expect.objectContaining({
        text: "Create account as the task objective",
        kind: "verb",
        colorCategory: PROMPT_COLOR_CATEGORY.verb,
        codebookId: "goal.account.create",
      }),
    ]);
    expect(highlightPromptText("SIL on ollama with Qwen3.6").map(({ text, kind }) => [text, kind])).toEqual([
      ["SIL", "noun"],
      [" ", null],
      ["on", "grammar"],
      [" ", null],
      ["ollama", "noun"],
      [" ", null],
      ["with", "grammar"],
      [" ", null],
      ["Qwen3.6", "noun"],
    ]);
    expect(highlightPromptText("go with Go").map(({ text, kind }) => [text, kind])).toEqual([
      ["go ", null],
      ["with", "grammar"],
      [" ", null],
      ["Go", "noun"],
    ]);
  });

  it("color-classifies SIL and SUI source by declared semantic role", () => {
    const sil = highlightSourceText(`task BuildSearch {
  goal: feature.add
  target: product.search
  require: latency.max_200_ms
  verify: tests.pass
  on_failure: task.abort
  bind: output.search.results -> ui.SearchScreen.search_results
}`, "sil");
    expect(sil.filter((token) => token.text.includes("goal")).at(0)).toMatchObject({ kind: "verb" });
    expect(sil.filter((token) => token.text.includes("product.search")).at(0)).toMatchObject({ kind: "noun" });
    expect(sil.filter((token) => token.text.includes("latency.max_200_ms")).at(0)).toMatchObject({ kind: "constraint" });
    expect(sil.filter((token) => token.text.includes("tests.pass")).at(0)).toMatchObject({ kind: "verification" });
    expect(sil.filter((token) => token.text.includes("task.abort")).at(0)).toMatchObject({ kind: "recovery" });
    expect(sil.filter((token) => token.text.includes("output.search.results")).at(0)).toMatchObject({ kind: "data" });
    expect(sil.filter((token) => token.text.includes("ui.SearchScreen.search_results")).at(0)).toMatchObject({ kind: "noun" });

    const sui = highlightSourceText("ui SearchScreen {\n  component: search_results\n  interaction: request.submit\n  constraint: keyboard.accessible\n}", "sui");
    expect(sui.filter((token) => token.text.includes("component")).at(0)).toMatchObject({ kind: "noun" });
    expect(sui.filter((token) => token.text.includes("interaction")).at(0)).toMatchObject({ kind: "verb" });
    expect(sui.filter((token) => token.text.includes("constraint")).at(0)).toMatchObject({ kind: "constraint" });
  });

  it("inserts clicked blocks at the current caret and dragged blocks at an exact position", () => {
    const to = PROMPT_BLOCKS.find((block) => block.id === "grammar-to");
    const api = PROMPT_BLOCKS.find((block) => block.id === "noun-api");
    const verify = PROMPT_BLOCKS.find((block) => block.id === "verify-tests-pass");
    expect(to).toBeDefined();
    expect(api).toBeDefined();
    expect(verify).toBeDefined();

    expect(insertPromptBlockText("Implement search.", to!, 9)).toEqual({
      value: "Implement to search.",
      caret: 12,
    });
    expect(insertPromptBlockText("Implement old service.", api!, 10, 13).value).toBe("Implement API service.");
    expect(insertPromptBlockText("Verification:\n- \nOn failure:", verify!, 16)).toEqual({
      value: "Verification:\n- tests pass\nOn failure:",
      caret: 26,
    });
    expect(insertPromptBlockText("Verification:\n- alpha beta", verify!, 22).value).toBe(
      "Verification:\n- alpha tests pass beta",
    );
  });

  it("suggests blocks from missing roles and the current semantic chunk", () => {
    expect(suggestPromptBlocks("", 1)[0]?.block.id).toBe("field-goal");

    const inputSuggestions = suggestPromptBlocks("Goal: Add search.\nTarget: Product search.\nAction: Implement.\nInputs:\n- ", 8);
    expect(inputSuggestions.some(({ block }) => block.kind === "data" && block.roles.includes("input"))).toBe(true);

    const verificationSuggestions = suggestPromptBlocks("Verification:\n- ", 8);
    expect(verificationSuggestions.slice(0, 5).every(({ block }) => block.roles.includes("verify"))).toBe(true);

    const recoverySuggestions = suggestPromptBlocks("On failure:\n- if verification fails, ", 8);
    expect(recoverySuggestions.slice(0, 5).every(({ block }) => block.kind === "recovery")).toBe(true);

    const afterTo = suggestPromptBlocks("Goal: I want to", 8);
    expect(afterTo.slice(0, 5).some(({ block }) => block.kind === "verb")).toBe(true);
  });

  it("deprioritizes a block after its exact phrase is already present", () => {
    const suggestions = suggestPromptBlocks("Verification:\n- tests pass", 6);
    expect(suggestions[0]?.block.id).not.toBe("verify-tests-pass");
  });
});
