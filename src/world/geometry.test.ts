import { describe, expect, it } from "vitest";
import { SCULPTURE, STEP_ARC, columnRibbon, createArcStep, drapeRibbon, finitePositions } from "./geometry";

describe("sculpture geometry", () => {
  it("builds a finite ribbon that stands taller than it is wide", () => {
    const geo = columnRibbon(SCULPTURE[0]!);
    expect(finitePositions(geo)).toBe(true);
    geo.computeBoundingBox();
    const box = geo.boundingBox!;
    const height = box.max.y - box.min.y;
    const width = box.max.x - box.min.x;
    expect(height).toBeGreaterThan(2);
    expect(height).toBeGreaterThan(width);
    geo.dispose();
  });

  it("builds the event drapes and the amphitheatre steps without empty meshes", () => {
    const drape = drapeRibbon({ side: -1, phase: 0.2, y: 1.5, width: 0.6 });
    expect(finitePositions(drape)).toBe(true);
    expect(drape.getAttribute("position").count).toBeGreaterThan(20);
    drape.dispose();

    const step = createArcStep(2, 3, 0.2, 0.1, STEP_ARC[0], STEP_ARC[1], 8);
    expect(finitePositions(step)).toBe(true);
    step.computeBoundingBox();
    expect(step.boundingBox!.max.z).toBeLessThan(0.2);
    expect(step.boundingBox!.min.z).toBeLessThan(0);
    step.dispose();
  });
});
