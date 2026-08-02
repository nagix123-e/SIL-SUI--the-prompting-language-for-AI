import { describe, expect, it } from "vitest";
import { orchestrateV03, parseV03 } from "../packages/compiler/src/index";

const source = `bundle Delivery:
    version: 0.4
    task Foundation:
        version: 0.4
        goal: feature.add
        target: foundation.module
        action: implement
        output: foundation.artifact
        verify: tests.foundation.pass
    task Documentation:
        version: 0.4
        goal: documentation.create
        target: project.documentation
        action: implement
        depends_on: Foundation
        dependency_kind: soft
        input: repository.readme
        output: documentation.artifact
        verify: tests.documentation.pass
`;

describe("non-executing phase orchestration", () => {
  it("defers missing evidence and soft dependencies rather than aborting the bundle", () => {
    const report = orchestrateV03(parseV03(source), { mode: "discover" });
    expect(report.contractAuthorization.staticAuthorization).toBe(false);
    expect(report.actualHostAuthorization).toBe("not_granted");
    expect(report.summary.status).toBe("partial");
    expect(report.phases.find((phase) => phase.phase === "Documentation")).toMatchObject({
      canProceed: true,
      nextStatus: "partial",
      deferredReferences: expect.arrayContaining(["Foundation", "repository.readme"]),
    });
  });

  it("blocks only the phase with an incomplete hard dependency", () => {
    const strict = source.replace("dependency_kind: soft", "dependency_kind: hard");
    const report = orchestrateV03(parseV03(strict), { mode: "implement", hostAuthorized: true });
    const foundation = report.phases.find((phase) => phase.phase === "Foundation");
    const documentation = report.phases.find((phase) => phase.phase === "Documentation");
    expect(foundation?.nextStatus).toBe("partial");
    expect(documentation).toMatchObject({ canProceed: false, nextStatus: "blocked" });
    expect(documentation?.gates.find((gate) => gate.reference === "Foundation")).toMatchObject({ disposition: "hard_block" });
  });

  it("requires explicit host authorization only for release mode", () => {
    const report = orchestrateV03(parseV03(source), { mode: "release" });
    expect(report.summary.status).toBe("blocked");
    expect(report.phases.every((phase) => phase.gates.some((gate) => gate.reference === "host.release_authorization"))).toBe(true);
  });
});
