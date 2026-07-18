import { describe, expect, it } from "vitest";
import {
  compileNaturalLanguage,
  compileSil,
  coreCodebook,
  dequantize,
  formatSil,
  parseSil,
  quantizeIr,
} from "../packages/compiler/src/index";

const source = `task AddLogin {
  goal: feature.add
  target: screen.login
  action: implement
  require: existing.behavior.preserve
  require: custom.audit.keep
  forbid: secret.expose
  verify: login.success
}`;

describe("SIL parser", () => {
  it("reports line and column for invalid syntax", () => {
    expect(() => parseSil("task Demo {\n  unknown: bad.value\n}")).toThrow(/2:3/);
  });

  it("formats deterministically", () => {
    const once = formatSil(source);
    expect(formatSil(once)).toBe(once);
  });
});

describe("semantic compilation", () => {
  it("compiles Japanese instructions with constraints", () => {
    const result = compileNaturalLanguage("既存動作を壊さずログイン画面を追加し、秘密をハードコードしない。テストする。");
    expect(result.ir.target).toBe("screen.login");
    expect(result.ir.required).toContain("existing.behavior.preserve");
    expect(result.ir.forbidden).toContain("secret.hardcode");
    expect(result.ir.metadata?.sourceLanguage).toBe("ja");
  });

  it("preserves unknown references in a lossless round trip", () => {
    const compiled = compileSil(source);
    const quantized = quantizeIr(compiled.ir, coreCodebook, "lossless");
    const restored = dequantize(quantized.code, coreCodebook).ir;
    expect(restored.taskId).toBe(compiled.ir.taskId);
    expect(restored.required).toEqual(compiled.ir.required);
    expect(restored.forbidden).toEqual(compiled.ir.forbidden);
    expect(restored.verification).toEqual(compiled.ir.verification);
  });

  it("does not omit unknown required rules in compact mode", () => {
    const compiled = compileSil(source);
    const quantized = quantizeIr(compiled.ir, coreCodebook, "compact");
    expect(dequantize(quantized.code, coreCodebook).ir.required).toContain("custom.audit.keep");
  });
});
