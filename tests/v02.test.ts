import { describe, expect, it } from "vitest";
import { formatV02Semantic, formatV02TopLevelBlock, parseV02, parseV02Semantic, parseV02TopLevelBlock, validateBindings, validateV02, validateV02Semantic, validateV02TopLevelBlock } from "../packages/v02/src/index";

const sil = `task BuildSearchUi {
  version: 0.2
  goal: feature.add
  target: product.search
  action: implement
  output: search.results
  verify: tests.pass
  on_failure: task.abort

  parameter response_time {
    type: number
    value: 200
    unit: ms
    operator: lte
  }

  model SearchRequest {
    format: json_schema
    field query {
      type: string
      required: true
    }
  }

  example SearchRequestJson {
    language: json
    applies_to: model.SearchRequest
    code: """
{"query":"keyboard"}
"""
  }

  bind: output.search.results -> ui.SearchScreen.search_results
}`;

const sui = `ui SearchScreen {
  version: 0.2
  screen: search_screen
  component: search_results
  verify: render.complete
  on_failure: task.abort

  token spacing_md {
    type: dimension
    value: 16
    unit: px
  }

  breakpoint compact {
    min: 0
    max: 767
    unit: px
  }

  a11y search_results {
    role: region
    label: search_results
  }

  transition loading_to_results {
    from: view.loading
    event: request.success
    to: view.success
  }
}`;

describe("SIL/SUI v0.2", () => {
  it("parses typed parameters, data models, and embedded code examples", () => {
    const contract = parseV02(sil);
    expect(validateV02(contract)).toMatchObject({ valid: true, diagnostics: [] });
    expect(contract.parameters[0].properties).toEqual(expect.arrayContaining([{ key: "unit", value: "ms", line: expect.any(Number) }]));
    expect(contract.models[0].fields[0].name).toBe("query");
    expect(contract.examples[0].code).toContain("keyboard");
  });

  it("validates mechanical SIL output to SUI component bindings", () => {
    const silContract = parseV02(sil);
    const suiContract = parseV02(sui);
    expect(validateV02(suiContract)).toMatchObject({ valid: true, diagnostics: [] });
    expect(validateBindings(silContract, suiContract)).toEqual([]);
  });

  it("carries explicit semantic definitions with a portable meaning", () => {
    const contract = parseV02(`${sil.replace(
      "  bind: output.search.results -> ui.SearchScreen.search_results",
      `  semantic SearchResultContract {
    reference: search.results
    kind: data_model
    meaning: The ordered search result collection rendered by SearchScreen.
    scope: bundle
  }

  bind: output.search.results -> ui.SearchScreen.search_results`,
    )}`);
    expect(validateV02(contract)).toMatchObject({ valid: true });
    expect(contract.semanticDefinitions[0]).toMatchObject({ name: "SearchResultContract" });
  });

  it("parses and validates a top-level portable semantic declaration", () => {
    const definition = parseV02Semantic(`semantic ShogiGame {
  reference: game.shogi
  kind: domain_rule
  meaning: Japanese chess rules including legal moves and checkmate.
  scope: bundle
}`);
    expect(validateV02Semantic(definition)).toMatchObject({ valid: true });
    expect(formatV02Semantic(definition)).toContain("semantic ShogiGame {");
  });

  it("parses reusable top-level v0.2 declarations", () => {
    const parameter = parseV02TopLevelBlock(`parameter board_files {
  type: file_list
  source: repository.shogi_assets
  required: true
}`);
    expect(validateV02TopLevelBlock(parameter)).toMatchObject({ valid: true });
    expect(formatV02TopLevelBlock(parameter)).toContain("parameter board_files {");
  });
});
