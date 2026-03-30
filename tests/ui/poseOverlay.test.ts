import { buildPoseOverlayPaths, computeCoverViewport } from "../../src/ui/poseOverlay";

describe("buildPoseOverlayPaths", () => {
  it("creates drawable skeleton segments from visible landmarks", () => {
    const points = Array.from({ length: 33 }, (_, index) => ({
      x: 0.1 + index * 0.01,
      y: 0.2 + index * 0.01,
      visibility: 0.95
    }));

    const paths = buildPoseOverlayPaths(points);

    expect(paths.length).toBeGreaterThan(5);
    expect(paths[0]?.start.visibility).toBeGreaterThan(0.35);
  });

  it("skips landmarks with low visibility", () => {
    const points = Array.from({ length: 33 }, () => ({
      x: 0.5,
      y: 0.5,
      visibility: 0.95
    }));
    points[11].visibility = 0.1;

    const paths = buildPoseOverlayPaths(points);

    expect(paths.every((path) => path.start.visibility >= 0.35 && path.end.visibility >= 0.35)).toBe(true);
  });

  it("matches object-fit cover cropping for non-16:9 webcam feeds", () => {
    const viewport = computeCoverViewport(640, 480, 320, 180);

    expect(viewport.drawWidth).toBe(320);
    expect(viewport.drawHeight).toBeCloseTo(240);
    expect(viewport.offsetY).toBeCloseTo(-30);
  });
});
