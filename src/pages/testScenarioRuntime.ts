import "../style.css";
import { SceneManager } from "../render/sceneManager";
import type { CounterMove, DodgeType, GuardResult, Vec3, WristPairTrajectory } from "../types/game";
import { createTestScenarioShell, type TestScenarioShellConfig } from "../ui/testScenarioShell";

interface TestScenario extends TestScenarioShellConfig {
  initialStatus: string;
  run: (context: TestScenarioContext) => void;
}

interface TestScenarioContext {
  scene: SceneManager;
  setStatus: (status: string) => void;
  schedule: (delayMs: number, callback: () => void) => void;
  clearScheduled: () => void;
}

const SAMPLE_THREAT_TRAJECTORY: WristPairTrajectory = [
  [
    { x: 0.38, y: 1.72, z: -1.86 },
    { x: 0.3, y: 1.76, z: -1.84 },
    { x: 0.2, y: 1.8, z: -1.82 },
    { x: 0.08, y: 1.78, z: -1.8 },
    { x: -0.02, y: 1.72, z: -1.78 },
    { x: -0.08, y: 1.66, z: -1.76 }
  ],
  [
    { x: -0.18, y: 1.18, z: -1.92 },
    { x: -0.16, y: 1.2, z: -1.9 },
    { x: -0.14, y: 1.22, z: -1.88 },
    { x: -0.12, y: 1.24, z: -1.86 },
    { x: -0.1, y: 1.26, z: -1.84 },
    { x: -0.08, y: 1.28, z: -1.82 }
  ]
];

const FACE_COUNTER_TARGET: Vec3 = { x: 0, y: 2.08, z: -0.8 };
const BLOCK_COUNTER_TARGET: Vec3 = { x: -0.32, y: 2.04, z: -0.86 };
const SWAY_COUNTER_TARGET: Vec3 = { x: 0.14, y: 2.02, z: -0.82 };

/** Plays a canned dodge and delayed counter sequence in the Three.js test scene. */
function queueCounterSequence(
  context: TestScenarioContext,
  config: {
    dodgeType: DodgeType;
    move: CounterMove;
    result: GuardResult;
    target: Vec3;
    finalStatus: string;
  }
): void {
  const startedAt = performance.now();
  context.scene.setThreatTrajectory(SAMPLE_THREAT_TRAJECTORY, startedAt);
  context.scene.triggerDodge(config.dodgeType, startedAt);
  context.setStatus("AI가 궤도를 읽고 회피했습니다. 0.8초 뒤 반격합니다.");
  context.schedule(820, () => {
    const counterAt = performance.now();
    context.scene.triggerCounter(config.move, config.result, counterAt, config.target);
    context.setStatus(config.finalStatus);
  });
}

/** Mounts one standalone combat motion test page into the current document. */
export async function mountTestScenarioPage(config: TestScenario): Promise<void> {
  const root = document.querySelector<HTMLElement>("#app");

  if (!root) {
    throw new Error("Root container was not found.");
  }

  const shell = createTestScenarioShell(root, config);
  const scene = new SceneManager(shell.sceneHost);
  const scheduled: number[] = [];
  let frameId: number | null = null;

  const clearScheduled = (): void => {
    while (scheduled.length > 0) {
      const timeoutId = scheduled.pop();
      if (typeof timeoutId === "number") {
        window.clearTimeout(timeoutId);
      }
    }
  };

  const schedule = (delayMs: number, callback: () => void): void => {
    const timeoutId = window.setTimeout(() => {
      const index = scheduled.indexOf(timeoutId);
      if (index >= 0) {
        scheduled.splice(index, 1);
      }
      callback();
    }, delayMs);
    scheduled.push(timeoutId);
  };

  const renderLoop = (now: number): void => {
    scene.render(now);
    frameId = window.requestAnimationFrame(renderLoop);
  };

  shell.statusValue.textContent = config.initialStatus;
  await scene.initialize();
  frameId = window.requestAnimationFrame(renderLoop);

  shell.runButton.addEventListener("click", () => {
    clearScheduled();
    config.run({
      scene,
      setStatus: (status) => {
        shell.statusValue.textContent = status;
      },
      schedule,
      clearScheduled
    });
  });

  window.addEventListener("beforeunload", () => {
    clearScheduled();
    if (frameId !== null) {
      window.cancelAnimationFrame(frameId);
    }
    scene.dispose();
  });
}

/** Returns the canned scenario that tests a clean dodge into a face counter. */
export function createCounterSequenceScenario(): TestScenario {
  return {
    title: "AI 회피 후 얼굴 반격",
    description: "버튼을 누르면 AI가 오른손 궤도를 읽고 회피한 뒤, 저장된 얼굴 좌표를 향해 반격합니다.",
    buttonLabel: "테스트 실행",
    initialStatus: "대기 중: 회피 후 얼굴 반격 시퀀스",
    run: (context) => {
      queueCounterSequence(context, {
        dodgeType: "right_weave",
        move: "left_hook",
        result: "hit",
        target: FACE_COUNTER_TARGET,
        finalStatus: "AI가 저장된 얼굴 좌표를 향해 반격했습니다."
      });
    }
  };
}

/** Returns the canned scenario that tests a blocked AI counter. */
export function createCounterBlockedScenario(): TestScenario {
  return {
    title: "AI 반격 블록 테스트",
    description: "버튼을 누르면 AI가 회피 후 반격하고, 결과는 팔/손으로 막힌 guarded counter 색상으로 표시됩니다.",
    buttonLabel: "테스트 실행",
    initialStatus: "대기 중: blocked counter 시나리오",
    run: (context) => {
      queueCounterSequence(context, {
        dodgeType: "left_duck",
        move: "right_straight",
        result: "guarded",
        target: BLOCK_COUNTER_TARGET,
        finalStatus: "AI 반격이 방어된 상태로 재생되었습니다."
      });
    }
  };
}

/** Returns the canned scenario that tests a sway-style defended counter. */
export function createCounterSwayScenario(): TestScenario {
  return {
    title: "AI 반격 스웨이 회피 테스트",
    description: "버튼을 누르면 AI가 회피 후 같은 좌표를 향해 반격하고, 유저가 뒤로 빠져 피한 guarded counter 결과를 재생합니다.",
    buttonLabel: "테스트 실행",
    initialStatus: "대기 중: sway defend 시나리오",
    run: (context) => {
      queueCounterSequence(context, {
        dodgeType: "right_duck",
        move: "left_uppercut",
        result: "guarded",
        target: SWAY_COUNTER_TARGET,
        finalStatus: "AI 반격이 스웨이 회피된 상태로 재생되었습니다."
      });
    }
  };
}
