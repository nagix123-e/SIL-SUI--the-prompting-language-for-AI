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
  it("compiles English instructions with constraints", () => {
    const result = compileNaturalLanguage(
      "Add a login screen without breaking existing behavior. Do not hardcode secrets and add tests.",
    );
    expect(result.ir.target).toBe("screen.login");
    expect(result.ir.required).toContain("existing.behavior.preserve");
    expect(result.ir.forbidden).toContain("secret.hardcode");
    expect(result.ir.metadata?.sourceLanguage).toBe("en");
  });

  it("rejects Japanese and mixed Japanese natural-language input", () => {
    expect(() => compileNaturalLanguage("\u30ed\u30b0\u30a4\u30f3\u753b\u9762\u3092\u8ffd\u52a0\u3057\u3066\u304f\u3060\u3055\u3044\u3002")).toThrow(
      "Only English natural-language instructions are supported.",
    );
    expect(() => compileNaturalLanguage("API\u3092\u66f4\u65b0\u3057\u3066\u304f\u3060\u3055\u3044\u3002")).toThrow(
      "Only English natural-language instructions are supported.",
    );
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
