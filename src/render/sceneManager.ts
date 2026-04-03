import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DODGE_DURATION_MS, TRAJECTORY_DISPLAY_MS } from "../game/constants";
import type { CounterMove, DodgeType, GuardResult, Vec3, WristPairTrajectory } from "../types/game";

const COUNTER_ANIMATION_MS = 460;
const VICTORY_ANIMATION_MS = 1100;
const THREAT_SEGMENT_POOL_SIZE = 100;
const THREAT_SEGMENT_RADIUS = 0.045;
const THREAT_SEGMENT_BASE_OPACITY = 0.72;
const LEFT_GLOVE_HOME = new THREE.Vector3(-0.22, 1.42, -1.36);
const RIGHT_GLOVE_HOME = new THREE.Vector3(0.26, 1.44, -1.34);
const FIGHTER_ASSET_PATH = "/assets/muscular_bodybuilder_boxing_fighter.glb";

interface PunchPose {
  leadX: number;
  leadY: number;
  leadZ: number;
  rearX: number;
  rearY: number;
  rearZ: number;
  torsoYaw: number;
  torsoRoll: number;
  torsoPitch: number;
  torsoDriveX: number;
  torsoDriveY: number;
}

interface ThreatSegmentSlot {
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  active: boolean;
  expiresAt: number;
}

/** Smoothly accelerates and decelerates lightweight combat motions. */
function easeInOutSine(value: number): number {
  return -(Math.cos(Math.PI * value) - 1) / 2;
}

/** Converts a dodge type to a signed lateral direction. */
function resolveDodgeSide(type: DodgeType): -1 | 1 {
  return type.startsWith("left") ? -1 : 1;
}

/** Returns the active punch pose for the requested counter animation frame. */
function resolvePunchPose(move: CounterMove, progress: number): PunchPose {
  const side = move.startsWith("left") ? -1 : 1;
  const windupProgress = progress < 0.28 ? easeInOutSine(progress / 0.28) : progress < 0.5 ? 1 - easeInOutSine((progress - 0.28) / 0.22) : 0;
  const strikeProgress =
    progress < 0.22 ? 0 : progress < 0.6 ? easeInOutSine((progress - 0.22) / 0.38) : 1 - easeInOutSine((progress - 0.6) / 0.4);

  if (move.endsWith("straight")) {
    return {
      leadX: side * (0.09 * strikeProgress - 0.1 * windupProgress),
      leadY: 0.02 * strikeProgress + 0.03 * windupProgress,
      leadZ: -0.92 * strikeProgress + 0.14 * windupProgress,
      rearX: side * 0.05 * strikeProgress,
      rearY: 0.04 * windupProgress,
      rearZ: -0.08 * windupProgress,
      torsoYaw: -side * (0.26 * strikeProgress - 0.12 * windupProgress),
      torsoRoll: -side * 0.08 * strikeProgress,
      torsoPitch: 0.04 * strikeProgress,
      torsoDriveX: side * 0.04 * strikeProgress,
      torsoDriveY: 0.02 * strikeProgress
    };
  }

  if (move.endsWith("hook")) {
    return {
      leadX: -side * (0.34 * strikeProgress) - side * 0.08 * windupProgress,
      leadY: 0.06 * strikeProgress,
      leadZ: -0.56 * strikeProgress + 0.1 * windupProgress,
      rearX: side * 0.06 * windupProgress,
      rearY: 0.02 * windupProgress,
      rearZ: -0.06 * windupProgress,
      torsoYaw: -side * (0.38 * strikeProgress - 0.08 * windupProgress),
      torsoRoll: -side * 0.18 * strikeProgress,
      torsoPitch: 0.02 * strikeProgress,
      torsoDriveX: side * 0.07 * strikeProgress,
      torsoDriveY: 0.015 * strikeProgress
    };
  }

  return {
    leadX: -side * 0.08 * windupProgress + side * 0.06 * strikeProgress,
    leadY: 0.32 * strikeProgress - 0.08 * windupProgress,
    leadZ: -0.66 * strikeProgress + 0.1 * windupProgress,
    rearX: side * 0.05 * windupProgress,
    rearY: 0.04 * windupProgress,
    rearZ: -0.05 * windupProgress,
    torsoYaw: -side * (0.18 * strikeProgress - 0.08 * windupProgress),
    torsoRoll: -side * 0.12 * strikeProgress,
    torsoPitch: -0.06 * windupProgress + 0.07 * strikeProgress,
    torsoDriveX: side * 0.03 * strikeProgress,
    torsoDriveY: 0.035 * strikeProgress
  };
}

/** Handles the Three.js scene, the avatar mesh, and lightweight combat animations. */
export class SceneManager {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(52, 1, 0.1, 100);
  private readonly renderer: THREE.WebGLRenderer;
  private readonly avatarGroup = new THREE.Group();
  private readonly avatarVisualGroup = new THREE.Group();
  private readonly fallbackAvatar = new THREE.Group();
  private readonly leftGlove = new THREE.Mesh(
    new THREE.SphereGeometry(0.11, 18, 18),
    new THREE.MeshStandardMaterial({ color: 0xd62839, roughness: 0.38, metalness: 0.05 })
  );
  private readonly rightGlove = new THREE.Mesh(
    new THREE.SphereGeometry(0.11, 18, 18),
    new THREE.MeshStandardMaterial({ color: 0xd62839, roughness: 0.38, metalness: 0.05 })
  );
  private readonly threatGroup = new THREE.Group();
  private readonly threatSegmentGeometry = new THREE.CylinderGeometry(
    THREAT_SEGMENT_RADIUS,
    THREAT_SEGMENT_RADIUS,
    1,
    12,
    1,
    false
  );
  private readonly threatSegments: ThreatSegmentSlot[] = [];
  private readonly shadowPlane = new THREE.Mesh(
    new THREE.CircleGeometry(0.78, 32),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22 })
  );
  private dodgeState: { type: DodgeType; startedAt: number } | null = null;
  private counterState: { startedAt: number; result: GuardResult; move: CounterMove; target: Vec3 } | null = null;
  private victoryState: { startedAt: number } | null = null;

  constructor(private readonly host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(host.clientWidth, host.clientHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.host.appendChild(this.renderer.domElement);
    this.bootstrapScene();
    this.resize();
  }

  /** Loads the external fighter avatar model and swaps it into the scene. */
  async initialize(): Promise<void> {
    const loader = new GLTFLoader();

    try {
      const fighter = (await loader.loadAsync(FIGHTER_ASSET_PATH)).scene;
      const bounds = new THREE.Box3().setFromObject(fighter);
      const size = bounds.getSize(new THREE.Vector3());
      const center = bounds.getCenter(new THREE.Vector3());
      const targetHeight = 3.2;
      const scale = size.y > 0 ? targetHeight / size.y : 1.4;
      const yFloorOffset = bounds.min.y * scale;
      fighter.scale.setScalar(scale);
      fighter.position.set(-center.x * scale, -yFloorOffset - 1.55, -2.04 - center.z * scale * 0.12);
      fighter.rotation.y = 0;
      fighter.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          child.material = Array.isArray(child.material)
            ? child.material.map((material) => material.clone())
            : child.material.clone();
        }
      });
      this.fallbackAvatar.visible = false;
      this.avatarVisualGroup.add(fighter);
    } catch (error) {
      console.warn("Unable to load fighter avatar, keeping fallback mesh.", error);
      this.fallbackAvatar.visible = true;
    }
  }

  /** Builds the static scene elements. */
  private bootstrapScene(): void {
    this.scene.background = new THREE.Color("#050d14");
    this.scene.fog = new THREE.Fog("#050d14", 4.2, 11.5);

    this.camera.position.set(0, 1.72, 1.28);
    this.camera.lookAt(0, 1.46, -2.12);

    const ambient = new THREE.AmbientLight(0xffffff, 0.75);
    const keyLight = new THREE.DirectionalLight(0xb2dbff, 1.35);
    keyLight.position.set(2.5, 4, 1.5);
    keyLight.castShadow = true;
    const rimLight = new THREE.PointLight(0xff7a59, 2.4, 12, 2);
    rimLight.position.set(-1.5, 2.8, -2.5);
    const topLight = new THREE.SpotLight(0xffffff, 22, 20, 0.48, 0.6, 1.4);
    topLight.position.set(0, 5.5, -0.5);
    topLight.target.position.set(0, 1.4, -2.1);
    topLight.castShadow = true;
    this.scene.add(ambient, keyLight, rimLight, topLight, topLight.target);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(6, 48),
      new THREE.MeshStandardMaterial({ color: 0x152733, roughness: 0.9, metalness: 0.04 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0;
    this.scene.add(floor);

    const ringPlatform = new THREE.Mesh(
      new THREE.CylinderGeometry(2.45, 2.6, 0.18, 48),
      new THREE.MeshStandardMaterial({ color: 0x101c24, roughness: 0.85, metalness: 0.08 })
    );
    ringPlatform.position.set(0, 0.09, -2.05);
    this.scene.add(ringPlatform);

    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.42, 1.15, 10, 20),
      new THREE.MeshStandardMaterial({ color: 0x446b82, roughness: 0.45, metalness: 0.12 })
    );
    body.position.set(0, 1.05, -1.95);

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.27, 24, 24),
      new THREE.MeshStandardMaterial({ color: 0xf7c59f, roughness: 0.68, metalness: 0.04 })
    );
    head.position.set(0, 1.85, -1.9);

    const leftShoulder = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 18, 18),
      new THREE.MeshStandardMaterial({ color: 0x1d3557 })
    );
    leftShoulder.position.set(-0.42, 1.55, -1.88);

    const rightShoulder = leftShoulder.clone();
    rightShoulder.position.x = 0.42;

    this.fallbackAvatar.add(body, head, leftShoulder, rightShoulder);
    this.avatarGroup.add(this.fallbackAvatar);
    this.shadowPlane.rotation.x = -Math.PI / 2;
    this.shadowPlane.position.set(0, 0.02, -1.98);
    this.leftGlove.position.set(-0.22, 1.42, -1.36);
    this.rightGlove.position.set(0.26, 1.44, -1.34);
    this.leftGlove.visible = false;
    this.rightGlove.visible = false;
    this.avatarVisualGroup.add(this.fallbackAvatar);
    this.avatarGroup.add(this.avatarVisualGroup, this.leftGlove, this.rightGlove, this.shadowPlane);
    this.scene.add(this.avatarGroup, this.threatGroup);
    this.bootstrapThreatPool();
  }

  /** Updates renderer size to match the host. */
  resize(): void {
    const width = Math.max(this.host.clientWidth, 1);
    const height = Math.max(this.host.clientHeight, 1);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  /** Rebuilds the translucent cylinder threat overlay for the latest prediction. */
  setThreatTrajectory(traj: WristPairTrajectory | null, now: number): void {
    if (!traj) {
      return;
    }

    for (const wristSteps of traj) {
      const smoothedPath = this.buildSmoothedPath(wristSteps);
      for (let index = 0; index < smoothedPath.length - 1; index += 1) {
        this.activateThreatSegment(smoothedPath[index], smoothedPath[index + 1], now + TRAJECTORY_DISPLAY_MS);
      }
    }
  }

  /** Starts a dodge animation. */
  triggerDodge(type: DodgeType, now: number): void {
    this.dodgeState = { type, startedAt: now };
  }

  /** Starts a counter animation colored by the guard result. */
  triggerCounter(move: CounterMove, result: GuardResult, now: number, target: Vec3): void {
    this.leftGlove.visible = true;
    this.rightGlove.visible = true;
    this.counterState = { move, result, target, startedAt: now };
  }

  /** Starts the opponent downed motion once the AI HP reaches zero. */
  triggerVictory(now: number): void {
    if (this.victoryState) {
      return;
    }

    this.dodgeState = null;
    this.counterState = null;
    this.leftGlove.visible = false;
    this.rightGlove.visible = false;
    this.victoryState = { startedAt: now };
  }

  /** Advances scene animation and renders one frame. */
  render(now: number): void {
    this.updateThreatOpacity(now);
    this.updateAvatarAnimation(now);
    this.renderer.render(this.scene, this.camera);
  }

  /** Releases WebGL resources. */
  dispose(): void {
    for (const slot of this.threatSegments) {
      slot.material.dispose();
    }
    this.threatSegmentGeometry.dispose();
    this.renderer.dispose();
  }

  private updateThreatOpacity(now: number): void {
    let activeCount = 0;
    for (const slot of this.threatSegments) {
      if (!slot.active) {
        continue;
      }

      const remaining = Math.max(slot.expiresAt - now, 0) / TRAJECTORY_DISPLAY_MS;
      if (remaining <= 0) {
        slot.active = false;
        slot.mesh.visible = false;
        continue;
      }

      activeCount += 1;
      slot.material.opacity = THREAT_SEGMENT_BASE_OPACITY * remaining;
    }

    this.threatGroup.visible = activeCount > 0;
  }

  private updateAvatarAnimation(now: number): void {
    const idleSwing = Math.sin(now * 0.0023);
    const idleDip = Math.sin(now * 0.0038);
    this.avatarGroup.position.set(idleSwing * 0.035, idleDip * 0.018, 0);
    this.avatarGroup.rotation.set(0, idleSwing * 0.08, idleSwing * 0.018);
    this.avatarVisualGroup.position.set(0, 0, 0);
    this.avatarVisualGroup.rotation.set(idleDip * 0.04, idleSwing * 0.08, idleSwing * 0.02);

    if (this.dodgeState) {
      const progress = Math.min((now - this.dodgeState.startedAt) / DODGE_DURATION_MS, 1);
      const arc = Math.sin(progress * Math.PI);
      const dodgeSide = resolveDodgeSide(this.dodgeState.type);
      const shoulderLeadYaw = -dodgeSide * 0.24 * arc;
      const shoulderLeadRoll = -dodgeSide * 0.08 * arc;

      if (this.dodgeState.type === "left_weave") {
        this.avatarGroup.position.x += -0.36 * arc;
        this.avatarGroup.position.y += -0.08 * arc;
        this.avatarGroup.rotation.z += -0.2 * arc;
        this.avatarGroup.rotation.y += -0.14 * arc;
      } else if (this.dodgeState.type === "right_weave") {
        this.avatarGroup.position.x += 0.36 * arc;
        this.avatarGroup.position.y += -0.08 * arc;
        this.avatarGroup.rotation.z += 0.2 * arc;
        this.avatarGroup.rotation.y += 0.14 * arc;
      } else if (this.dodgeState.type === "left_duck") {
        this.avatarGroup.position.x += -0.18 * arc;
        this.avatarGroup.position.y += -0.34 * arc;
        this.avatarGroup.rotation.x += 0.08 * arc;
      } else {
        this.avatarGroup.position.x += 0.18 * arc;
        this.avatarGroup.position.y += -0.34 * arc;
        this.avatarGroup.rotation.x += 0.08 * arc;
      }
      this.avatarVisualGroup.position.x += dodgeSide * 0.06 * arc;
      this.avatarVisualGroup.rotation.y += shoulderLeadYaw;
      this.avatarVisualGroup.rotation.z += shoulderLeadRoll;

      if (progress >= 1) {
        this.dodgeState = null;
      }
    }

    this.leftGlove.position.copy(LEFT_GLOVE_HOME);
    this.rightGlove.position.copy(RIGHT_GLOVE_HOME);
    this.leftGlove.scale.setScalar(1);
    this.rightGlove.scale.setScalar(1);
    if (this.counterState) {
      const progress = Math.min((now - this.counterState.startedAt) / COUNTER_ANIMATION_MS, 1);
      const activeGlove = this.counterState.move.startsWith("left") ? this.leftGlove : this.rightGlove;
      const supportGlove = this.counterState.move.startsWith("left") ? this.rightGlove : this.leftGlove;
      const isGuarded = this.counterState.result === "guarded";
      const punchPose = resolvePunchPose(this.counterState.move, progress);
      this.avatarGroup.updateMatrixWorld(true);
      const targetLocal = this.avatarGroup.worldToLocal(
        new THREE.Vector3(this.counterState.target.x, this.counterState.target.y, this.counterState.target.z)
      );
      const targetBlend = progress < 0.2 ? 0 : Math.min((progress - 0.2) / 0.45, 1) * 0.72;
      (activeGlove.material as THREE.MeshStandardMaterial).color.set(isGuarded ? "#80ed99" : "#ff5a5f");
      activeGlove.scale.setScalar(isGuarded ? 1.06 : 1.12);
      supportGlove.scale.setScalar(0.98);
      this.avatarVisualGroup.position.x += punchPose.torsoDriveX;
      this.avatarVisualGroup.position.y += punchPose.torsoDriveY;
      this.avatarVisualGroup.rotation.x += punchPose.torsoPitch;
      this.avatarVisualGroup.rotation.y += punchPose.torsoYaw;
      this.avatarVisualGroup.rotation.z += punchPose.torsoRoll;
      this.shadowPlane.scale.set(1 + Math.abs(punchPose.torsoDriveX) * 0.6, 1 + punchPose.torsoDriveY * 1.2, 1);

      activeGlove.position.x += punchPose.leadX;
      activeGlove.position.y += punchPose.leadY;
      activeGlove.position.z += punchPose.leadZ;
      activeGlove.position.x = THREE.MathUtils.lerp(activeGlove.position.x, targetLocal.x, targetBlend);
      activeGlove.position.y = THREE.MathUtils.lerp(activeGlove.position.y, targetLocal.y, targetBlend);
      activeGlove.position.z = THREE.MathUtils.lerp(activeGlove.position.z, targetLocal.z, targetBlend);
      supportGlove.position.x += punchPose.rearX;
      supportGlove.position.y += punchPose.rearY;
      supportGlove.position.z += punchPose.rearZ;

      if (progress >= 1) {
        (this.leftGlove.material as THREE.MeshStandardMaterial).color.set("#d62839");
        (this.rightGlove.material as THREE.MeshStandardMaterial).color.set("#d62839");
        this.leftGlove.visible = false;
        this.rightGlove.visible = false;
        this.counterState = null;
      }
    } else {
      this.leftGlove.visible = false;
      this.rightGlove.visible = false;
      this.shadowPlane.scale.set(1, 1, 1);
    }

    if (this.victoryState) {
      const progress = Math.min((now - this.victoryState.startedAt) / VICTORY_ANIMATION_MS, 1);
      const impact = easeInOutSine(Math.min(progress / 0.32, 1));
      const collapse = progress <= 0.18 ? 0 : easeInOutSine((progress - 0.18) / 0.82);
      this.avatarGroup.position.x += 0.08 * impact + 0.42 * collapse;
      this.avatarGroup.position.y += -0.1 * impact - 0.96 * collapse;
      this.avatarGroup.position.z += 0.12 * collapse;
      this.avatarGroup.rotation.x += -0.14 * impact - 0.42 * collapse;
      this.avatarGroup.rotation.y += -0.18 * impact - 0.22 * collapse;
      this.avatarGroup.rotation.z += 0.2 * impact + 1.32 * collapse;
      this.avatarVisualGroup.rotation.x += -0.08 * collapse;
      this.avatarVisualGroup.rotation.z += 0.16 * collapse;
      this.shadowPlane.scale.set(1.08 + collapse * 0.54, 0.94 + collapse * 0.28, 1);
    }
  }

  /** Pre-allocates threat meshes so trajectory updates can reuse existing GPU resources. */
  private bootstrapThreatPool(): void {
    for (let index = 0; index < THREAT_SEGMENT_POOL_SIZE; index += 1) {
      const material = new THREE.MeshStandardMaterial({
        color: 0xff4f4f,
        transparent: true,
        opacity: THREAT_SEGMENT_BASE_OPACITY,
        emissive: 0xaa2222,
        emissiveIntensity: 0.8
      });
      const mesh = new THREE.Mesh(this.threatSegmentGeometry, material);
      mesh.visible = false;
      this.threatGroup.add(mesh);
      this.threatSegments.push({
        mesh,
        material,
        active: false,
        expiresAt: 0
      });
    }
  }

  /** Activates one pooled segment and assigns start/end transform plus lifetime. */
  private activateThreatSegment(start: THREE.Vector3, end: THREE.Vector3, expiresAt: number): void {
    const direction = new THREE.Vector3().subVectors(end, start);
    const length = direction.length();
    if (length <= 1e-4) {
      return;
    }

    const slot = this.findReusableThreatSlot();
    slot.active = true;
    slot.expiresAt = expiresAt;
    slot.material.opacity = THREAT_SEGMENT_BASE_OPACITY;
    slot.mesh.visible = true;
    slot.mesh.position.copy(start).add(end).multiplyScalar(0.5);
    slot.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    slot.mesh.scale.set(1, length, 1);
  }

  /** Returns an inactive slot when available, otherwise recycles the oldest active one. */
  private findReusableThreatSlot(): ThreatSegmentSlot {
    const inactive = this.threatSegments.find((slot) => !slot.active);
    if (inactive) {
      return inactive;
    }

    let oldest = this.threatSegments[0];
    for (const slot of this.threatSegments) {
      if (slot.expiresAt < oldest.expiresAt) {
        oldest = slot;
      }
    }
    return oldest;
  }

  /** Keeps the rendered threat path identical to the collision path used by combat logic. */
  private buildSmoothedPath(wristSteps: Vec3[]): THREE.Vector3[] {
    return wristSteps.map((point) => new THREE.Vector3(point.x, point.y, point.z));
  }
}
