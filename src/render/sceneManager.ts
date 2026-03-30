import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DODGE_DURATION_MS, TRAJECTORY_DISPLAY_MS } from "../game/constants";
import type { CounterMove, DodgeType, GuardResult, WristPairTrajectory } from "../types/game";
import { lerp } from "../utils/vector";

function createCylinderBetween(start: THREE.Vector3, end: THREE.Vector3): THREE.Mesh {
  const direction = new THREE.Vector3().subVectors(end, start);
  const length = Math.max(direction.length(), 0.001);
  const geometry = new THREE.CylinderGeometry(0.045, 0.045, length, 12, 1, false);
  const material = new THREE.MeshStandardMaterial({
    color: 0xff4f4f,
    transparent: true,
    opacity: 0.48,
    emissive: 0xaa2222,
    emissiveIntensity: 0.8
  });
  const cylinder = new THREE.Mesh(geometry, material);
  cylinder.position.copy(start).add(end).multiplyScalar(0.5);
  cylinder.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
  return cylinder;
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
  private readonly shadowPlane = new THREE.Mesh(
    new THREE.CircleGeometry(0.78, 32),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22 })
  );
  private readonly waistClipPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.05);
  private dodgeState: { type: DodgeType; startedAt: number } | null = null;
  private counterState: { startedAt: number; result: GuardResult; move: CounterMove } | null = null;
  private threatExpiresAt = 0;

  constructor(private readonly host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(host.clientWidth, host.clientHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.localClippingEnabled = true;
    this.host.appendChild(this.renderer.domElement);
    this.bootstrapScene();
    this.resize();
  }

  /** Loads the external fighter avatar model and swaps it into the scene. */
  async initialize(): Promise<void> {
    const loader = new GLTFLoader();

    try {
      const fighter = (await loader.loadAsync("/assets/animated_human_by_get3dmodels.glb")).scene;
      const bounds = new THREE.Box3().setFromObject(fighter);
      const size = bounds.getSize(new THREE.Vector3());
      const center = bounds.getCenter(new THREE.Vector3());
      const targetHeight = 2.9;
      const scale = size.y > 0 ? targetHeight / size.y : 1.4;
      fighter.scale.setScalar(scale);
      fighter.position.set(-center.x * scale, -bounds.min.y * scale, -2.05 - center.z * scale * 0.2);
      fighter.rotation.y = 0;
      const scaledBounds = new THREE.Box3().setFromObject(fighter);
      const waistY = scaledBounds.min.y + scaledBounds.getSize(new THREE.Vector3()).y * 0.44;
      this.waistClipPlane.constant = -waistY;
      fighter.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          child.material = materials.map((material) => {
            const cloned = material.clone();
            cloned.clippingPlanes = [this.waistClipPlane];
            return cloned;
          });
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

    this.camera.position.set(0, 1.66, 1.56);
    this.camera.lookAt(0, 1.42, -2.18);

    const ambient = new THREE.AmbientLight(0xffffff, 0.75);
    const keyLight = new THREE.DirectionalLight(0xb2dbff, 1.35);
    keyLight.position.set(2.5, 4, 1.5);
    const rimLight = new THREE.PointLight(0xff7a59, 2.4, 12, 2);
    rimLight.position.set(-1.5, 2.8, -2.5);
    const topLight = new THREE.SpotLight(0xffffff, 22, 20, 0.48, 0.6, 1.4);
    topLight.position.set(0, 5.5, -0.5);
    topLight.target.position.set(0, 1.4, -2.1);
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

    const ropeMaterial = new THREE.MeshStandardMaterial({ color: 0xca2c44, roughness: 0.45, metalness: 0.15 });
    for (const height of [0.88, 1.08, 1.28]) {
      const rope = new THREE.Mesh(new THREE.TorusGeometry(2.08, 0.02, 8, 64), ropeMaterial);
      rope.rotation.x = Math.PI / 2;
      rope.position.set(0, height, -2.04);
      this.scene.add(rope);
    }

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
    [body, head, leftShoulder, rightShoulder].forEach((mesh) => {
      (mesh.material as THREE.MeshStandardMaterial).clippingPlanes = [this.waistClipPlane];
    });
    this.shadowPlane.rotation.x = -Math.PI / 2;
    this.shadowPlane.position.set(0, 0.02, -1.98);
    this.leftGlove.position.set(-0.22, 1.42, -1.36);
    this.rightGlove.position.set(0.26, 1.44, -1.34);
    this.avatarVisualGroup.add(this.fallbackAvatar);
    this.avatarGroup.add(this.avatarVisualGroup, this.leftGlove, this.rightGlove, this.shadowPlane);
    this.scene.add(this.avatarGroup, this.threatGroup);
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
    this.threatGroup.clear();
    this.threatExpiresAt = now + TRAJECTORY_DISPLAY_MS;

    if (!traj) {
      return;
    }

    for (const wristSteps of traj) {
      for (let index = 0; index < wristSteps.length - 1; index += 1) {
        const start = wristSteps[index];
        const end = wristSteps[index + 1];
        this.threatGroup.add(
          createCylinderBetween(
            new THREE.Vector3(start.x, start.y, start.z),
            new THREE.Vector3(end.x, end.y, end.z)
          )
        );
      }
    }
  }

  /** Starts a dodge animation. */
  triggerDodge(type: DodgeType, now: number): void {
    this.dodgeState = { type, startedAt: now };
  }

  /** Starts a counter animation colored by the guard result. */
  triggerCounter(move: CounterMove, result: GuardResult, now: number): void {
    this.counterState = { move, result, startedAt: now };
  }

  /** Advances scene animation and renders one frame. */
  render(now: number): void {
    this.updateThreatOpacity(now);
    this.updateAvatarAnimation(now);
    this.renderer.render(this.scene, this.camera);
  }

  /** Releases WebGL resources. */
  dispose(): void {
    this.renderer.dispose();
  }

  private updateThreatOpacity(now: number): void {
    const remaining = Math.max(this.threatExpiresAt - now, 0) / TRAJECTORY_DISPLAY_MS;
    this.threatGroup.visible = remaining > 0;
    this.threatGroup.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
        child.material.opacity = 0.48 * remaining;
      }
    });
  }

  private updateAvatarAnimation(now: number): void {
    const idleSwing = Math.sin(now * 0.0023);
    const idleDip = Math.sin(now * 0.0038);
    this.avatarGroup.position.set(idleSwing * 0.035, idleDip * 0.018, 0);
    this.avatarGroup.rotation.set(0, idleSwing * 0.08, idleSwing * 0.018);
    this.avatarVisualGroup.rotation.set(idleDip * 0.04, idleSwing * 0.08, idleSwing * 0.02);

    if (this.dodgeState) {
      const progress = Math.min((now - this.dodgeState.startedAt) / DODGE_DURATION_MS, 1);
      const arc = Math.sin(progress * Math.PI);

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

      if (progress >= 1) {
        this.dodgeState = null;
      }
    }

    this.leftGlove.position.set(-0.22, 1.42, -1.36);
    this.rightGlove.position.set(0.26, 1.44, -1.34);
    if (this.counterState) {
      const progress = Math.min((now - this.counterState.startedAt) / 420, 1);
      const punchArc = Math.sin(progress * Math.PI);
      const activeGlove =
        this.counterState.move.startsWith("left") ? this.leftGlove : this.rightGlove;
      const isGuarded = this.counterState.result === "guarded";
      (activeGlove.material as THREE.MeshStandardMaterial).color.set(isGuarded ? "#80ed99" : "#ff5a5f");

      if (this.counterState.move.endsWith("straight")) {
        activeGlove.position.z = lerp(activeGlove.position.z, -0.48, punchArc);
        activeGlove.position.y += 0.02 * punchArc;
      } else if (this.counterState.move.endsWith("hook")) {
        activeGlove.position.x += (this.counterState.move.startsWith("left") ? 0.26 : -0.26) * punchArc;
        activeGlove.position.z = lerp(activeGlove.position.z, -0.72, punchArc);
        activeGlove.position.y += 0.04 * punchArc;
      } else {
        activeGlove.position.y += 0.22 * punchArc;
        activeGlove.position.z = lerp(activeGlove.position.z, -0.74, punchArc);
      }

      if (progress >= 1) {
        (this.leftGlove.material as THREE.MeshStandardMaterial).color.set("#d62839");
        (this.rightGlove.material as THREE.MeshStandardMaterial).color.set("#d62839");
        this.counterState = null;
      }
    }
  }
}
