import type { PoseOverlayPoint } from "../types/game";

const CONNECTIONS: Array<[number, number]> = [
  [0, 11],
  [0, 12],
  [11, 12],
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16]
];

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
  const visibleIndices = new Set([0, 11, 12, 13, 14, 15, 16]);

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
    context.lineWidth = 4;
    context.strokeStyle = "rgba(240, 246, 255, 0.92)";
    context.lineCap = "round";

    for (const segment of segments) {
      const start = projectOverlayPoint(segment.start, viewport);
      const end = projectOverlayPoint(segment.end, viewport);
      context.beginPath();
      context.moveTo(start.x, start.y);
      context.lineTo(end.x, end.y);
      context.stroke();
    }

    for (const point of filteredPoints) {
      if (point.visibility < 0.35) {
        continue;
      }

      const isFace = point.y < 0.32;
      const projected = projectOverlayPoint(point, viewport);
      context.beginPath();
      context.arc(projected.x, projected.y, isFace ? 4 : 5.5, 0, Math.PI * 2);
      context.fillStyle = isFace ? "#ffb703" : "#4cc9f0";
      context.fill();
      context.strokeStyle = "rgba(0, 0, 0, 0.3)";
      context.lineWidth = 1.5;
      context.stroke();
    }
  }
}
