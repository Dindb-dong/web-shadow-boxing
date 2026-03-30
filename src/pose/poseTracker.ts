import {
  FilesetResolver,
  PoseLandmarker,
  type NormalizedLandmark
} from "@mediapipe/tasks-vision";
import type { PoseFrame, PoseOverlayPoint, Vec3 } from "../types/game";

const WASM_ROOT = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm";
const MODEL_ASSET =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

function landmarkToVec3(landmark: NormalizedLandmark | undefined): Vec3 | null {
  if (!landmark) {
    return null;
  }

  const visibility = landmark.visibility ?? 1;
  if (visibility < 0.35) {
    return null;
  }

  return {
    x: landmark.x - 0.5,
    y: 0.5 - landmark.y,
    z: landmark.z
  };
}

/** Owns webcam access and MediaPipe pose inference for the browser runtime. */
export class PoseTracker {
  private poseLandmarker: PoseLandmarker | null = null;
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private lastOverlayPoints: PoseOverlayPoint[] = [];

  /** Requests webcam access and loads the pose landmarker assets. */
  async initialize(video: HTMLVideoElement): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("This browser does not support webcam access.");
    }

    this.video = video;
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        width: { ideal: 960 },
        height: { ideal: 540 },
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
      numPoses: 1,
      runningMode: "VIDEO"
    });
  }

  /** Samples one pose frame from the current video stream. */
  sample(timestamp: number): PoseFrame | null {
    if (!this.poseLandmarker || !this.video || this.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      return null;
    }

    const result = this.poseLandmarker.detectForVideo(this.video, timestamp);
    const landmarks = result.landmarks[0];

    if (!landmarks) {
      this.lastOverlayPoints = [];
      return null;
    }

    this.lastOverlayPoints = landmarks.map((landmark) => ({
      x: landmark.x,
      y: landmark.y,
      visibility: landmark.visibility ?? 1
    }));

    return {
      timestamp,
      nose: landmarkToVec3(landmarks[0]),
      leftShoulder: landmarkToVec3(landmarks[11]),
      leftElbow: landmarkToVec3(landmarks[13]),
      leftWrist: landmarkToVec3(landmarks[15]),
      rightShoulder: landmarkToVec3(landmarks[12]),
      rightElbow: landmarkToVec3(landmarks[14]),
      rightWrist: landmarkToVec3(landmarks[16])
    };
  }

  /** Returns the latest normalized landmark list for 2D pose overlay rendering. */
  getLastOverlayPoints(): PoseOverlayPoint[] {
    return [...this.lastOverlayPoints];
  }

  /** Releases camera and model resources. */
  dispose(): void {
    this.poseLandmarker?.close();
    this.poseLandmarker = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    if (this.video) {
      this.video.srcObject = null;
    }
  }
}
