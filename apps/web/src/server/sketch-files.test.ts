import { describe, expect, it } from "vitest";
import { inspectionPdf, sketchToPng } from "./sketch-files";

describe("skissefiler", () => {
  it("lager PNG og PDF med gyldig signatur", () => {
    const png = sketchToPng({
      points: [
        { x: 0, y: 0 },
        { x: 3.5, y: 0 },
        { x: 3.5, y: 2.35 },
        { x: 0, y: 2.35 },
      ],
      doorEdge: 0,
      ceilingHeightM: 2.4,
      slope: { kneeHeightM: 1.4, ridgeHeightM: 2.4 },
    });
    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    const pdf = inspectionPdf({ title: "Bad", lines: ["Omkrets 11.70 m", "Gulv 8.23 m2"] });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.includes("%%EOF")).toBe(true);
  });
});
