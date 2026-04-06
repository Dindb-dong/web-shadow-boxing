import type { PoseOverlayPoint } from "../types/game";

const CONNECTIONS: Array<[number, number]> = [
  [0, 11],
  [0, 12],
  [11, 12],
  [11, 13],
  [13, 15],
  [15, 17],
  [15, 19],
  [15, 21],
  [12, 14],
  [14, 16],
  [16, 18],
  [16, 20],
  [16, 22]
];
const DEBUG_LANDMARK_ORDER = [0, 15, 16, 19, 20, 11, 12, 13, 14];
const LANDMARK_LABELS: Record<number, string> = {
  0: "nose",
  11: "leftShoulder",
  12: "rightShoulder",
  13: "leftElbow",
  14: "rightElbow",
  15: "leftWrist",
  16: "rightWrist",
  17: "leftPinky",
  18: "rightPinky",
  19: "leftIndex",
  20: "rightIndex",
  21: "leftThumb",
  22: "rightThumb"
};

export interface PoseOverlaySegment {
  start: PoseOverlayPoint;
  end: PoseOverlayPoint;
}

export interface PoseOverlayViewport {
  drawWidth: number;
  drawHeight: number;
  offsetX: number;
  offsetY: number;
}

export interface ProjectedOverlayPoint {
  x: number;
  y: number;
}

export interface PoseOverlayDebugProbe {
  landmarkIndex: number;
  landmarkLabel: string;
  rawPoint: PoseOverlayPoint;
  preMirrorPoint: ProjectedOverlayPoint;
  postMirrorPoint: ProjectedOverlayPoint;
}

export interface PoseOverlayDebugSnapshot {
  sourceWidth: number;
  sourceHeight: number;
  canvasWidth: number;
  canvasHeight: number;
  viewport: PoseOverlayViewport;
  probe: PoseOverlayDebugProbe | null;
  overlayMirrorMode: "full-mirror";
}

/** Builds drawable line segments from the latest MediaPipe landmark list. */
export function buildPoseOverlayPaths(points: PoseOverlayPoint[]): PoseOverlaySegment[] {
  return CONNECTIONS.flatMap(([startIndex, endIndex]) => {
    const start = points[startIndex];
    const end = points[endIndex];

    if (!start || !end || start.visibility < 0.35 || end.visibility < 0.35) {
      return [];
    }

    return [{ start, end }];
  });
}

/** Keeps the overlay focused on the upper-body landmarks used by the game. */
export function filterOverlayPoints(points: PoseOverlayPoint[]): PoseOverlayPoint[] {
  const visibleIndices = new Set([0, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22]);

  return points.map((point, index) =>
    visibleIndices.has(index)
      ? point
      : {
          x: point.x,
          y: point.y,
          visibility: 0
        }
  );
}

/** Computes the visible object-fit cover box used by the mirrored webcam element. */
export function computeCoverViewport(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number
): PoseOverlayViewport {
  if (sourceWidth <= 0 || sourceHeight <= 0 || targetWidth <= 0 || targetHeight <= 0) {
    return {
      drawWidth: targetWidth,
      drawHeight: targetHeight,
      offsetX: 0,
      offsetY: 0
    };
  }

  const sourceAspect = sourceWidth / sourceHeight;
  const targetAspect = targetWidth / targetHeight;

  if (sourceAspect > targetAspect) {
    const drawHeight = targetHeight;
    const drawWidth = drawHeight * sourceAspect;
    return {
      drawWidth,
      drawHeight,
      offsetX: (targetWidth - drawWidth) / 2,
      offsetY: 0
    };
  }

  const drawWidth = targetWidth;
  const drawHeight = drawWidth / sourceAspect;
  return {
    drawWidth,
    drawHeight,
    offsetX: 0,
    offsetY: (targetHeight - drawHeight) / 2
  };
}

/** Projects one normalized landmark into the visible webcam rectangle. */
export function projectOverlayPoint(
  point: PoseOverlayPoint,
  viewport: PoseOverlayViewport
): ProjectedOverlayPoint {
  return {
    x: viewport.offsetX + point.x * viewport.drawWidth,
    y: viewport.offsetY + point.y * viewport.drawHeight
  };
}

/** Mirrors one projected landmark horizontally inside the visible webcam rectangle. */
export function mirrorOverlayPoint(
  point: PoseOverlayPoint,
  viewport: PoseOverlayViewport
): ProjectedOverlayPoint {
  return {
    x: viewport.offsetX + (1 - point.x) * viewport.drawWidth,
    y: viewport.offsetY + point.y * viewport.drawHeight
  };
}

/** Captures the current coordinate-system measurements needed to debug overlay alignment. */
export function buildPoseOverlayDebugSnapshot(
  points: PoseOverlayPoint[],
  sourceWidth: number,
  sourceHeight: number,
  canvasWidth: number,
  canvasHeight: number
): PoseOverlayDebugSnapshot {
  const viewport = computeCoverViewport(sourceWidth, sourceHeight, canvasWidth, canvasHeight);
  const probe = DEBUG_LANDMARK_ORDER.flatMap((landmarkIndex) => {
    const point = points[landmarkIndex];

    if (!point || point.visibility < 0.35) {
      return [];
    }

    return [
      {
        landmarkIndex,
        landmarkLabel: LANDMARK_LABELS[landmarkIndex] ?? `landmark-${landmarkIndex}`,
        rawPoint: point,
        preMirrorPoint: projectOverlayPoint(point, viewport),
        postMirrorPoint: mirrorOverlayPoint(point, viewport)
      }
    ];
  })[0] ?? null;

  return {
    sourceWidth,
    sourceHeight,
    canvasWidth,
    canvasHeight,
    viewport,
    probe,
    overlayMirrorMode: "full-mirror"
  };
}

/** Formats raw pixel/debug values into a compact on-canvas string. */
function formatDebugValue(value: number, digits = 1): string {
  return Number.isFinite(value) ? value.toFixed(digits) : "n/a";
}

/** Draws a single debug marker and label onto the overlay canvas. */
function drawDebugMarker(
  context: CanvasRenderingContext2D,
  point: ProjectedOverlayPoint,
  color: string,
  label: string,
  height: number
): void {
  context.save();
  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineWidth = 2;
  context.setLineDash([5, 5]);
  context.beginPath();
  context.moveTo(point.x, 0);
  context.lineTo(point.x, height);
  context.stroke();
  context.setLineDash([]);
  context.beginPath();
  context.arc(point.x, point.y, 6, 0, Math.PI * 2);
  context.fill();
  context.font = '12px "Rajdhani", sans-serif';
  context.fillText(label, point.x + 8, Math.max(point.y - 10, 14));
  context.restore();
}

/** Renders live coordinate measurements over the webcam overlay for alignment debugging. */
function drawDebugHud(
  context: CanvasRenderingContext2D,
  snapshot: PoseOverlayDebugSnapshot,
  width: number,
  height: number
): void {
  context.save();
  context.strokeStyle = "rgba(255, 255, 255, 0.45)";
  context.lineWidth = 1;
  context.setLineDash([8, 6]);
  context.strokeRect(
    snapshot.viewport.offsetX,
    snapshot.viewport.offsetY,
    snapshot.viewport.drawWidth,
    snapshot.viewport.drawHeight
  );
  context.restore();

  if (snapshot.probe) {
    drawDebugMarker(context, snapshot.probe.preMirrorPoint, "#ffb703", "pre", height);
    drawDebugMarker(context, snapshot.probe.postMirrorPoint, "#4cc9f0", "post", height);
  }

  const debugLines = [
    "Overlay Debug",
    snapshot.probe
      ? `probe ${snapshot.probe.landmarkLabel} raw ${formatDebugValue(snapshot.probe.rawPoint.x, 3)}, ${formatDebugValue(snapshot.probe.rawPoint.y, 3)}`
      : "probe none visible",
    `video ${formatDebugValue(snapshot.sourceWidth, 0)} x ${formatDebugValue(snapshot.sourceHeight, 0)}`,
    `canvas ${formatDebugValue(snapshot.canvasWidth, 0)} x ${formatDebugValue(snapshot.canvasHeight, 0)}`,
    `cover ${formatDebugValue(snapshot.viewport.drawWidth)} x ${formatDebugValue(snapshot.viewport.drawHeight)} off ${formatDebugValue(snapshot.viewport.offsetX)}, ${formatDebugValue(snapshot.viewport.offsetY)}`,
    snapshot.probe
      ? `pre ${formatDebugValue(snapshot.probe.preMirrorPoint.x)}, ${formatDebugValue(snapshot.probe.preMirrorPoint.y)}`
      : "pre n/a",
    snapshot.probe
      ? `post ${formatDebugValue(snapshot.probe.postMirrorPoint.x)}, ${formatDebugValue(snapshot.probe.postMirrorPoint.y)}`
      : "post n/a",
    `mirror ${snapshot.overlayMirrorMode}`
  ];
  const panelWidth = Math.min(310, width - 16);
  const panelHeight = debugLines.length * 16 + 16;

  context.save();
  context.fillStyle = "rgba(4, 12, 20, 0.82)";
  context.strokeStyle = "rgba(173, 217, 255, 0.35)";
  context.lineWidth = 1;
  context.fillRect(8, 8, panelWidth, panelHeight);
  context.strokeRect(8, 8, panelWidth, panelHeight);
  context.font = '12px "Space Grotesk", sans-serif';
  context.textBaseline = "top";
  debugLines.forEach((line, index) => {
    context.fillStyle = index === 0 ? "#9fcbeb" : "#f0f6ff";
    context.fillText(line, 16, 16 + index * 16, panelWidth - 16);
  });

  if (snapshot.probe) {
    context.fillStyle = "#ffb703";
    context.fillRect(16, panelHeight + 8 - 12, 10, 3);
    context.fillStyle = "#4cc9f0";
    context.fillRect(56, panelHeight + 8 - 12, 10, 3);
    context.fillStyle = "#f0f6ff";
    context.fillText("pre", 29, panelHeight + 8 - 16);
    context.fillText("post", 69, panelHeight + 8 - 16);
  }
  context.restore();
  context.save();
  context.strokeStyle = "rgba(76, 201, 240, 0.6)";
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(width / 2, 0);
  context.lineTo(width / 2, height);
  context.stroke();
  context.restore();
}

/** Draws a MediaPipe-style body wireframe over the mirrored webcam preview. */
export class PoseOverlayRenderer {
  constructor(private readonly canvas: HTMLCanvasElement) {}

  /** Resizes the overlay canvas to match its video container. */
  resize(): void {
    const parent = this.canvas.parentElement;
    if (!parent) {
      return;
    }

    const ratio = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(Math.round(parent.clientWidth * ratio), 1);
    this.canvas.height = Math.max(Math.round(parent.clientHeight * ratio), 1);
    this.canvas.style.width = `${parent.clientWidth}px`;
    this.canvas.style.height = `${parent.clientHeight}px`;
  }

  /** Renders joints and connections for the current webcam frame. */
  draw(points: PoseOverlayPoint[], sourceWidth: number, sourceHeight: number): void {
    this.resize();
    const context = this.canvas.getContext("2d");
    if (!context) {
      return;
    }

    const ratio = window.devicePixelRatio || 1;
    const width = this.canvas.width / ratio;
    const height = this.canvas.height / ratio;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);

    const filteredPoints = filterOverlayPoints(points);
    const segments = buildPoseOverlayPaths(filteredPoints);
    const viewport = computeCoverViewport(sourceWidth, sourceHeight, width, height);
    const debugSnapshot = buildPoseOverlayDebugSnapshot(filteredPoints, sourceWidth, sourceHeight, width, height);
    context.lineWidth = 4;
    context.strokeStyle = "rgba(240, 246, 255, 0.92)";
    context.lineCap = "round";

    for (const segment of segments) {
      const start = mirrorOverlayPoint(segment.start, viewport);
      const end = mirrorOverlayPoint(segment.end, viewport);
      context.beginPath();
      context.moveTo(start.x, start.y);
      context.lineTo(end.x, end.y);
      context.stroke();
    }

    for (const [index, point] of filteredPoints.entries()) {
      if (point.visibility < 0.35) {
        continue;
      }

      const isFace = point.y < 0.32;
      const isHand = index >= 17 && index <= 22;
      const projected = mirrorOverlayPoint(point, viewport);
      context.beginPath();
      context.arc(projected.x, projected.y, isFace ? 4 : isHand ? 4.4 : 5.5, 0, Math.PI * 2);
      context.fillStyle = isFace ? "#ffb703" : isHand ? "#90e0ef" : "#4cc9f0";
      context.fill();
      context.strokeStyle = "rgba(0, 0, 0, 0.3)";
      context.lineWidth = 1.5;
      context.stroke();
    }

    drawDebugHud(context, debugSnapshot, width, height);
  }
}
