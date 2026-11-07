import { describe, expect, it } from "vitest";
import { qualityFor } from "./quality";

describe("graphics budget", () => {
  it("drops reflection, shadows and motes when the device is tight or asks to save data", () => {
    expect(qualityFor({ cores: 8, memoryGb: 8, coarse: false, saveData: true })).toMatchObject({ tier: "low", dpr: 1, reflection: false, shadows: false });
    expect(qualityFor({ cores: 2, memoryGb: null, coarse: true, saveData: false }).tier).toBe("low");
    expect(qualityFor({ cores: 8, memoryGb: 2, coarse: false, saveData: false }).dpr).toBe(1);
  });

  it("keeps a lighter phone budget and a fuller desktop budget", () => {
    const phone = qualityFor({ cores: 6, memoryGb: 4, coarse: true, saveData: false });
    const desktop = qualityFor({ cores: 8, memoryGb: 8, coarse: false, saveData: false });
    expect(phone.tier).toBe("medium");
    expect(phone.shadows).toBe(false);
    expect(phone.dpr).toBeLessThan(desktop.dpr);
    expect(desktop.shadows).toBe(true);
    expect(desktop.reflection).toBe(true);
  });
});
