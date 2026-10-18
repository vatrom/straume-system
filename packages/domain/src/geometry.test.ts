import { describe, expect, it } from "vitest";
import { DomainError } from "./errors";
import {
  assertSlope,
  ensureClockwise,
  floorArea,
  numberedWalls,
  perimeter,
  roomMeasures,
  sketchToSvg,
  sectionToSvg,
  withWallLength,
  type Sketch,
} from "./geometry";

const rect: Sketch = {
  points: [
    { x: 0, y: 0 },
    { x: 3.5, y: 0 },
    { x: 3.5, y: 2.35 },
    { x: 0, y: 2.35 },
  ],
  doorEdge: 0,
  ceilingHeightM: 2.4,
};

describe("romgeometri", () => {
  it("regner areal og omkrets for et rektangel", () => {
    expect(floorArea(rect.points)).toBeCloseTo(8.225, 3);
    expect(perimeter(rect.points)).toBeCloseTo(11.7, 3);
    const measures = roomMeasures(rect);
    expect(measures).toEqual({ perimeterM: 11.7, floorAreaM: 8.225, ceilingHeightM: 2.4 });
  });

  it("nummererer vegger med klokka fra døra", () => {
    const walls = numberedWalls(rect);
    expect(walls.map((wall) => wall.number)).toEqual([1, 2, 3, 4]);
    expect(walls[0]).toMatchObject({ edgeIndex: 0, lengthM: 3.5 });
    expect(walls[1]?.lengthM).toBeCloseTo(2.35, 3);
    const doorOnShortSide = numberedWalls({ ...rect, doorEdge: 1 });
    expect(doorOnShortSide[0]).toMatchObject({ number: 1, edgeIndex: 1 });
    expect(doorOnShortSide[1]).toMatchObject({ number: 2, edgeIndex: 2 });
  });

  it("normaliserer mot klokka og beholder samme dørvegg", () => {
    const ccw: Sketch["points"] = [
      { x: 0, y: 0 },
      { x: 0, y: 2 },
      { x: 4, y: 2 },
      { x: 4, y: 0 },
    ];
    const norm = ensureClockwise(ccw, 0);
    const walls = numberedWalls({ points: norm.points, doorEdge: norm.doorEdge });
    expect(walls[0]?.lengthM).toBeCloseTo(2, 5);
    expect(floorArea(norm.points)).toBeCloseTo(8, 5);
  });

  it("endrer lengden på en rettvinklet vegg uten å skjeve rommet", () => {
    const square: Sketch = {
      points: [
        { x: 0, y: 0 },
        { x: 2, y: 0 },
        { x: 2, y: 2 },
        { x: 0, y: 2 },
      ],
      doorEdge: 0,
      ceilingHeightM: 2.4,
    };
    const next = withWallLength(square, 1, 3);
    expect(numberedWalls(next)[0]?.lengthM).toBeCloseTo(3, 5);
    expect(floorArea(next.points)).toBeCloseTo(6, 5);
    expect(next.points).toEqual([
      { x: 0, y: 0 },
      { x: 3, y: 0 },
      { x: 3, y: 2 },
      { x: 0, y: 2 },
    ]);
  });

  it("holder en skrå polygon lukket når en vegg endres", () => {
    const triangle: Sketch = {
      points: [
        { x: 0, y: 0 },
        { x: 2, y: 0 },
        { x: 0.4, y: 1.5 },
      ],
      doorEdge: 0,
      ceilingHeightM: 2.4,
    };
    const next = withWallLength(triangle, 1, 4);
    expect(next.points).toHaveLength(3);
    expect(numberedWalls(next)[0]?.lengthM).toBeCloseTo(4, 5);
    expect(floorArea(next.points)).toBeGreaterThan(0);
  });

  it("støtter L-form og skråtak i snitt", () => {
    const lShape: Sketch = {
      points: [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 2 },
        { x: 2, y: 2 },
        { x: 2, y: 3 },
        { x: 0, y: 3 },
      ],
      doorEdge: 0,
      ceilingHeightM: 2.4,
      slope: { kneeHeightM: 1.4, ridgeHeightM: 2.4 },
    };
    expect(floorArea(lShape.points)).toBeCloseTo(10, 5);
    expect(numberedWalls(lShape)).toHaveLength(6);
    expect(assertSlope(lShape.slope!)).toEqual({ kneeHeightM: 1.4, ridgeHeightM: 2.4 });
    expect(() => assertSlope({ kneeHeightM: 2.4, ridgeHeightM: 1.2 })).toThrow(DomainError);
    const svg = sketchToSvg(lShape, "Bad");
    expect(svg).toContain("V1");
    expect(svg).toContain("Omkrets");
    expect(sectionToSvg({ widthM: 2.35, kneeHeightM: 1.4, ridgeHeightM: 2.4 })).toContain("skråtak");
  });
});
