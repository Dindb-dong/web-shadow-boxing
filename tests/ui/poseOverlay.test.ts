import {
  buildPoseOverlayDebugSnapshot,
  buildPoseOverlayPaths,
  computeCoverViewport,
  filterOverlayPoints,
  mirrorOverlayPoint,
  projectOverlayPoint
} from "../../src/ui/poseOverlay";

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

  it("projects x coordinates directly inside the cover viewport", () => {
    const projected = projectOverlayPoint(
      { x: 0.25, y: 0.5, visibility: 1 },
      { drawWidth: 300, drawHeight: 200, offsetX: 10, offsetY: 20 }
    );

    expect(projected.x).toBeCloseTo(85);
    expect(projected.y).toBeCloseTo(120);
  });

  it("mirrors x coordinates inside the visible webcam viewport", () => {
    const projected = mirrorOverlayPoint(
      { x: 0.25, y: 0.5, visibility: 1 },
      { drawWidth: 300, drawHeight: 200, offsetX: 10, offsetY: 20 }
    );

    expect(projected.x).toBeCloseTo(235);
    expect(projected.y).toBeCloseTo(120);
  });

  it("keeps only the upper-body landmarks visible for the overlay", () => {
    const filtered = filterOverlayPoints(
      Array.from({ length: 33 }, (_, index) => ({
        x: index / 33,
        y: index / 33,
        visibility: 1
      }))
    );

    expect(filtered[1].visibility).toBe(0);
    expect(filtered[11].visibility).toBe(1);
    expect(filtered[15].visibility).toBe(1);
  });

  it("builds a debug snapshot with pre and post mirror coordinates", () => {
    const points = Array.from({ length: 33 }, () => ({
      x: 0.5,
      y: 0.5,
      visibility: 0
    }));
    points[0] = { x: 0.2, y: 0.3, visibility: 0.95 };

    const snapshot = buildPoseOverlayDebugSnapshot(points, 640, 480, 320, 180);

    expect(snapshot.viewport.drawHeight).toBeCloseTo(240);
    expect(snapshot.probe?.landmarkLabel).toBe("nose");
    expect(snapshot.probe?.preMirrorPoint.x).toBeCloseTo(64);
    expect(snapshot.probe?.postMirrorPoint.x).toBeCloseTo(256);
    expect(snapshot.overlayMirrorMode).toBe("coordinate");
  });
});
