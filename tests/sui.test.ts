import { describe, expect, it } from "vitest";
import { formatSui, generateSuiPrompt, parseSui, SUI_BLOCKS, SUI_BLOCK_FIELDS, suiAstToIr, validateSui } from "../packages/sui/src/index";

const source = `ui PromptEditor {
  screen: prompt_editor
  layout: sidebar.left_third
  component: prompt_block_library
  component: english_prompt_editor
  interaction: block.drag_drop_insert
  constraint: sidebar.collapsible
  verify: drag_drop.inserts_at_caret
  on_failure: task.abort
}`;

describe("SUI DSL", () => {
  it("parses, validates, and formats an indented UI specification", () => {
    const ast = parseSui(source);
    expect(validateSui(ast)).toMatchObject({ valid: true, diagnostics: [] });
    expect(formatSui(source)).toContain("  interaction: block.drag_drop_insert");
  });

  it("keeps UI semantics separate from SIL execution contracts", () => {
    const ir = suiAstToIr(parseSui(source));
    expect(ir.screen).toBe("prompt_editor");
    expect(generateSuiPrompt(ir)).toContain("Interactions");
  });

  it("provides legacy fields plus a bounded render_each SUI editor template", () => {
    expect(SUI_BLOCKS).toHaveLength(201);
    for (const field of SUI_BLOCK_FIELDS) {
      expect(SUI_BLOCKS.filter((block) => block.field === field)).toHaveLength(field === "render_each" ? 1 : 20);
    }
    expect(SUI_BLOCKS.find((block) => block.field === "render_each")?.insertText).toContain("max_items: 100");
  });
});
