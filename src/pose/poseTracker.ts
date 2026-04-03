import {
  FilesetResolver,
  PoseLandmarker,
  type NormalizedLandmark
} from "@mediapipe/tasks-vision";
import { SAMPLE_INTERVAL_MS } from "../game/constants";
import type { PoseFrame, PoseOverlayPoint, Vec3 } from "../types/game";

const WASM_ROOT = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm";
const MODEL_ASSET = "/assets/pose_landmarker_full.task";
const SHOULDER_VISIBILITY_THRESHOLD = 0.45;
const ELBOW_VISIBILITY_THRESHOLD = 0.45;
const WRIST_VISIBILITY_THRESHOLD = 0.55;

function worldLandmarkToVec3(
  worldLandmark: NormalizedLandmark | undefined,
  imageLandmark: NormalizedLandmark | undefined,
  minVisibility: number
): Vec3 | null {
  if (!worldLandmark || !imageLandmark) {
    return null;
  }

  if ((imageLandmark.visibility ?? 1) < minVisibility) {
    return null;
  }

  return {
    x: worldLandmark.x,
    y: worldLandmark.y,
    z: worldLandmark.z
  };
}

/** Owns webcam access and a continuously running 20 FPS MediaPipe pose stream. */
export class PoseTracker {
  private poseLandmarker: PoseLandmarker | null = null;
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private lastOverlayPoints: PoseOverlayPoint[] = [];
  private latestPoseFrame: PoseFrame | null = null;
  private samplingTimer: number | null = null;
  private disposed = false;

  /** Requests webcam access, loads MediaPipe, and starts the continuous sampling loop. */
  async initialize(video: HTMLVideoElement): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("This browser does not support webcam access.");
    }

    this.video = video;
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 20, max: 20 },
        facingMode: "user"
      }
    });

    this.video.srcObject = this.stream;
    this.video.muted = true;
    this.video.playsInline = true;
    await this.video.play();

    const vision = await FilesetResolver.forVisionTasks(WASM_ROOT);
    this.poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: MODEL_ASSET
      },
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
      numPoses: 1,
      runningMode: "VIDEO"
    });

    this.disposed = false;
    this.scheduleSampleLoop();
  }

  /** Returns the latest cached world-landmark pose from the background MediaPipe loop. */
  sample(): PoseFrame | null {
    return this.latestPoseFrame ? { ...this.latestPoseFrame } : null;
  }

  /** Returns the latest normalized image-landmark list for overlay rendering. */
  getLastOverlayPoints(): PoseOverlayPoint[] {
    return [...this.lastOverlayPoints];
  }

  private scheduleSampleLoop(): void {
    this.samplingTimer = window.setTimeout(() => {
      this.runSampleStep();
      if (!this.disposed) {
        this.scheduleSampleLoop();
      }
    }, SAMPLE_INTERVAL_MS);
  }

  private runSampleStep(): void {
    if (
      !this.poseLandmarker ||
      !this.video ||
      this.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
    ) {
      return;
    }

    const result = this.poseLandmarker.detectForVideo(this.video, performance.now());
    const overlayLandmarks = result.landmarks[0];
    const worldLandmarks = result.worldLandmarks[0];

    this.lastOverlayPoints = overlayLandmarks
      ? overlayLandmarks.map((landmark) => ({
          x: landmark.x,
          y: landmark.y,
          visibility: landmark.visibility ?? 1
        }))
      : [];

    if (!overlayLandmarks || !worldLandmarks) {
      this.latestPoseFrame = null;
      return;
    }

    this.latestPoseFrame = {
      timestamp: performance.now(),
      nose: worldLandmarkToVec3(worldLandmarks[0], overlayLandmarks[0], SHOULDER_VISIBILITY_THRESHOLD),
      leftShoulder: worldLandmarkToVec3(
        worldLandmarks[11],
        overlayLandmarks[11],
        SHOULDER_VISIBILITY_THRESHOLD
      ),
      leftElbow: worldLandmarkToVec3(worldLandmarks[13], overlayLandmarks[13], ELBOW_VISIBILITY_THRESHOLD),
      leftWrist: worldLandmarkToVec3(worldLandmarks[15], overlayLandmarks[15], WRIST_VISIBILITY_THRESHOLD),
      rightShoulder: worldLandmarkToVec3(
        worldLandmarks[12],
        overlayLandmarks[12],
        SHOULDER_VISIBILITY_THRESHOLD
      ),
      rightElbow: worldLandmarkToVec3(worldLandmarks[14], overlayLandmarks[14], ELBOW_VISIBILITY_THRESHOLD),
      rightWrist: worldLandmarkToVec3(worldLandmarks[16], overlayLandmarks[16], WRIST_VISIBILITY_THRESHOLD)
    };
  }

  /** Releases camera, model, and the background sampling loop. */
  dispose(): void {
    this.disposed = true;
    if (this.samplingTimer !== null) {
      window.clearTimeout(this.samplingTimer);
      this.samplingTimer = null;
    }

    this.poseLandmarker?.close();
    this.poseLandmarker = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.latestPoseFrame = null;
    this.lastOverlayPoints = [];

    if (this.video) {
      this.video.srcObject = null;
    }
  }
}
