import { describe, expect, it } from "vitest";
import { parseV02 } from "../packages/v02/src/index";
import {
  enrichSilSuiBundle,
  formatSilSuiBundle,
  isSilSuiBundleSource,
  parseSilSuiBundle,
  validateSilSuiBundle,
} from "../packages/bundle/src/index";

const shogiBundle = `task BuildShogiGame {
  version: 0.2
  goal: feature.add
  target: game.shogi
  action: implement
  input: ui_spec.ShogiGameScreen
  output: game.board.state
  verify: tests.pass
  on_failure: task.abort
  bind: output.game.board.state -> ui.ShogiGameScreen.board
}

ui ShogiGameScreen {
  version: 0.2
  screen: game.shogi
  component: board
  verify: render.complete
  on_failure: task.abort
}

ui PromotionDialog {
  version: 0.2
  screen: dialog.promotion
  component: promotion_choices
  verify: render.complete
  on_failure: task.abort
}

ui GameResultDialog {
  version: 0.2
  screen: dialog.game_result
  component: result_summary
  verify: render.complete
  on_failure: task.abort
}`;

describe("SIL/SUI bundles", () => {
  it("accepts one task followed by multiple named UI contracts", () => {
    expect(isSilSuiBundleSource(shogiBundle)).toBe(true);
    const bundle = parseSilSuiBundle(shogiBundle);
    expect(bundle.task?.name).toBe("BuildShogiGame");
    expect(bundle.uis.map((ui) => ui.name)).toEqual(["ShogiGameScreen", "PromotionDialog", "GameResultDialog"]);
    expect(validateSilSuiBundle(shogiBundle)).toMatchObject({ valid: true, executionReady: false });
  });

  it("keeps the strict single-contract v0.2 parser unchanged", () => {
    expect(() => parseV02(shogiBundle)).toThrow("Unexpected content after definition");
  });

  it("reports unresolved cross-contract references", () => {
    const result = validateSilSuiBundle(shogiBundle.replace("ui_spec.ShogiGameScreen", "ui_spec.MissingScreen"));
    expect(result.valid).toBe(false);
    expect(result.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ code: "ui-spec-missing" })]));
  });

  it("resolves snake_case UI references to their PascalCase declarations", () => {
    const result = validateSilSuiBundle(shogiBundle.replace(
      "ui_spec.ShogiGameScreen",
      "ui_spec.shogi_game_screen\n  input: ui_spec.promotion_dialog\n  input: ui_spec.game_result_dialog",
    ));
    expect(result).toMatchObject({ valid: true });
  });

  it("preserves unregistered task words as generic semantic markers", () => {
    const result = validateSilSuiBundle(shogiBundle.replace("action: implement", "action: orchestrate").replace("target: game.shogi", "target: library.NovaEngine"));
    expect(result.unregisteredReferences).toEqual(expect.arrayContaining([
      expect.objectContaining({ reference: "orchestrate", marker: "extension.verb" }),
      expect.objectContaining({ reference: "library.NovaEngine", marker: "extension.proper_noun" }),
    ]));
  });

  it("treats explicitly defined unknown domain terms as interoperable extensions", () => {
    const source = shogiBundle.replace(
      "  bind: output.game.board.state -> ui.ShogiGameScreen.board",
      `  semantic ShogiDomain {
    reference: game.shogi
    kind: domain_rule
    meaning: Japanese chess rules, board state, legal moves, promotion, and checkmate.
    scope: bundle
  }

  semantic GameBoardState {
    reference: game.board.state
    kind: data_model
    meaning: The current Shogi board position, player turn, captured pieces, and legal move state.
    scope: bundle
  }

  bind: output.game.board.state -> ui.ShogiGameScreen.board`,
    );
    const result = validateSilSuiBundle(source);
    expect(result).toMatchObject({ valid: true, semanticInteroperable: true, unregisteredReferences: [] });
    expect(result.semanticReferences).toEqual(expect.arrayContaining([
      expect.objectContaining({ reference: "game.shogi", resolution: "declared_extension" }),
      expect.objectContaining({ reference: "game.board.state", resolution: "declared_extension" }),
      expect.objectContaining({ reference: "ui_spec.ShogiGameScreen", resolution: "structural_reference" }),
    ]));
  });

  it("accepts top-level semantic declarations as a shared bundle manifest", () => {
    const source = `${shogiBundle}

semantic ShogiGame {
  reference: game.shogi
  kind: domain_rule
  meaning: Japanese chess rules including legal moves, promotion, and checkmate.
  scope: bundle
}

semantic ShogiBoardState {
  reference: game.board.state
  kind: data_model
  meaning: The board position, turn, captures, and legal move state.
  scope: bundle
}`;
    const result = validateSilSuiBundle(source);
    expect(parseSilSuiBundle(source).semantics).toHaveLength(2);
    expect(result).toMatchObject({ valid: true, semanticInteroperable: true, unregisteredReferences: [] });
    expect(formatSilSuiBundle(source)).toContain("semantic ShogiGame {");
  });

  it("accepts shared parameter, model, and example declarations after semantics", () => {
    const source = `${shogiBundle}

semantic ShogiGame {
  reference: game.shogi
  kind: domain_rule
  meaning: Japanese chess rules including legal moves, promotion, and checkmate.
  scope: bundle
}

semantic ShogiBoardState {
  reference: game.board.state
  kind: data_model
  meaning: The board position, turn, captures, and legal move state.
  scope: bundle
}

parameter board_files {
  type: file_list
  source: repository.shogi_assets
  required: true
}

model ShogiBoardFile {
  format: json_schema
  field board {
    type: array
    required: true
  }
}

example ShogiBoardFixture {
  language: json
  applies_to: model.ShogiBoardFile
  source: fixtures.shogi_board
}`;
    const result = validateSilSuiBundle(source);
    expect(parseSilSuiBundle(source).sharedBlocks.map((block) => block.name)).toEqual(["board_files", "ShogiBoardFile", "ShogiBoardFixture"]);
    expect(result).toMatchObject({ valid: true, semanticInteroperable: true });
    expect(formatSilSuiBundle(source)).toContain("parameter board_files {");
  });

  it("accepts explicitly permitted web evidence without treating it as Core registration", () => {
    const result = validateSilSuiBundle(shogiBundle, {
      allowWebEnrichment: true,
      semanticEvidence: [
        {
          reference: "game.shogi",
          meaning: "Japanese chess with legal moves, promotion, captures, and checkmate.",
          source: "web",
          url: "https://www.shogi.or.jp/match/taikyoku_rules/",
          retrievedAt: "2026-07-23T00:00:00.000Z",
        },
        {
          reference: "game.board.state",
          meaning: "The board position, side to move, captured pieces, and legal move state.",
          source: "repository",
        },
      ],
    });
    expect(result).toMatchObject({ valid: true, semanticInteroperable: true, unregisteredReferences: [] });
    expect(result.semanticReferences).toEqual(expect.arrayContaining([
      expect.objectContaining({ reference: "game.shogi", resolution: "web_resolved_extension" }),
      expect.objectContaining({ reference: "game.board.state", resolution: "evidence_resolved_extension" }),
    ]));
  });

  it("supports a host-provided resolver for any permitted research source", async () => {
    const result = await enrichSilSuiBundle(shogiBundle, {
      async resolve(requests) {
        expect(requests.map((request) => request.reference)).toEqual(expect.arrayContaining(["game.shogi", "game.board.state"]));
        return [
          { reference: "game.shogi", meaning: "Japanese chess rules.", source: "web", url: "https://www.shogi.or.jp/match/taikyoku_rules/" },
          { reference: "game.board.state", meaning: "Board and turn state.", source: "repository" },
        ];
      },
    }, { allowWebEnrichment: true });
    expect(result).toMatchObject({ semanticInteroperable: true, unregisteredReferences: [] });
  });

  it("accepts self-describing local verification and shared-parameter references", () => {
    const source = shogiBundle.replace(
      "  output: game.board.state",
      `  input: parameter.board_file_count
  output: code.patch
  output: game.board.state
  prefer: interaction.immediate_feedback
  verify: game.initial_position.correct
  verify: game.legal_moves.complete`,
    ).replace(
      "  bind: output.game.board.state -> ui.ShogiGameScreen.board",
      `  semantic ShogiGame {
    reference: game.shogi
    kind: domain_rule
    meaning: Japanese chess rules.
    scope: bundle
  }

  semantic BoardState {
    reference: game.board.state
    kind: data_model
    meaning: Board position and turn state.
    scope: bundle
  }

  bind: output.game.board.state -> ui.ShogiGameScreen.board`,
    ) + `

parameter board_file_count {
  type: integer
  value: 9
  operator: eq
}`;
    expect(validateSilSuiBundle(source)).toMatchObject({ valid: true, semanticInteroperable: true, executionReady: true, unregisteredReferences: [] });
  });

  it("does not split an embedded code example on braces", () => {
    const source = shogiBundle.replace(
      "  bind: output.game.board.state -> ui.ShogiGameScreen.board",
      `  example RenderFunction {
    language: typescript
    applies_to: game.board
    code: """
function render() { return { board: true }; }
"""
  }
  bind: output.game.board.state -> ui.ShogiGameScreen.board`,
    );
    expect(parseSilSuiBundle(source).contracts).toHaveLength(4);
    expect(formatSilSuiBundle(source)).toContain("ui GameResultDialog {");
  });
});
