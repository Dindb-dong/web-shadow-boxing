# PROJECT CURRENT STATUS

Date: 2026-03-30

## Current Summary

Step 3 웹게임 MVP는 `Vite + TypeScript + Three.js + Docker` 기반 브라우저 클라이언트로 동작하며, 최근 UI 개선으로 `사용자 MediaPipe 포즈 오버레이`, `상반신 중심의 실제 GLB 아바타`, `좌/우 위빙 및 좌/우 더킹 기반 복싱 카운터 패턴`이 반영되었다. 실제 학습 모델은 아직 연결되지 않았으며, 팀원이 공유한 출력 스펙을 그대로 따르는 mock predictor가 기본 추론 엔진으로 들어가 있다. 최근 세션에서 아바타가 보이지 않던 문제는 해결했지만, 웹캠 오버레이는 여전히 실제 사용자보다 왼쪽으로 크게 치우쳐 보이는 상태라 후속 보정이 필요하다.

## Current Behavior

1. 브라우저에서 웹캠 권한을 요청하고 MediaPipe Pose로 `nose`, 양손 `shoulder/elbow/wrist`를 추적한다.
2. 최근 12프레임을 유지하면서 어깨 중심/어깨 거리 기준 정규화, 위치/속도/가속도 계산을 통해 `(12, 54)` 시퀀스를 생성한다.
3. mock predictor는 모델 출력 계약인 `state_idx`, `state_name`, `attacking_prob`, `traj(2, 6, 3)`, `raw` 형태로 결과를 반환한다.
4. 예측 궤도는 Three.js 씬에서 반투명 빨간 실린더 형태로 잠깐 표시된다.
5. 웹캠 패널에는 MediaPipe 스타일 2D 스켈레톤 오버레이가 그려지며, 현재는 전체 포즈 대신 `코/어깨/팔꿈치/손목` 중심의 상체 랜드마크만 표시한다.
6. AI는 임시 캡슐 지오메트리 대신 로컬에 저장된 인간형 GLB 아바타를 로드하며, 카메라와 모델 위치를 조정해 골반 위 중심의 스파링 상대처럼 보이도록 연출한다.
7. AI는 기본적으로 헤드 무브먼트와 가드 자세를 유지하고, 위협 궤적이 감지되면 `left/right weave`, `left/right duck` 중 하나로 회피한다.
8. 회피 후에는 방향과 회피 종류에 맞는 정형화된 카운터 조합을 사용한다. 예를 들면 같은 방향 훅/어퍼 또는 반대손 스트레이트가 교대로 나온다.
9. 반격 시 유저 손목이 코 근처면 guard 성공으로 처리하고, 아니면 player HP가 감소한다.
10. HUD에는 player HP, AI stamina, 추적 상태, 모델 상태, 공격 확률, 가드 결과가 표시된다.

## Architecture Notes

- 프론트엔드는 `src/pose`, `src/model`, `src/game`, `src/render`, `src/ui`, `src/types`로 역할을 분리했다.
- `PoseSequenceBuffer`가 짧은 추적 누락을 흡수하고 model-ready feature sequence를 제공한다.
- `CombatSystem`은 회피, 스태미나 회복/소모, 반격, 가드 판정을 독립적으로 관리한다.
- `PoseOverlayRenderer`가 비디오 원본 비율과 카드 비율 차이를 계산해 2D 캔버스를 보정한 뒤, 현재는 상체 랜드마크만 웹캠 프리뷰 위에 오버레이한다.
- `CombatSystem`은 방향성 있는 dodge 타입과 structured counter move를 함께 관리한다.
- Three.js 씬은 인간형 GLB 캐릭터, 링 스타일 무대, 헤드 무브먼트, 붉은 궤도 시각화를 담당한다.

## Operational Notes

- 현재 기본 predictor는 mock 구현이다. 실제 ONNX/TF.js 모델이 준비되면 predictor 구현체만 교체하는 방향으로 설계되어 있다.
- MediaPipe 모델과 wasm은 런타임에 원격 에셋을 사용한다.
- AI 아바타는 `Get3DModels`의 무료 GLB 에셋을 로컬 `public/assets/animated_human_by_get3dmodels.glb`로 보관해 로드한다.
- 실행과 테스트는 Docker 기준으로 맞췄으며, `docker compose up app`, `docker compose run --rm test` 흐름을 사용한다.
- 최근 수정으로 아바타가 안 보이던 문제는 해결되었고, AI가 유저 쪽을 바라보도록 회전값을 수정했다.

## Current Limitations

- 실제 Step 2 모델 파일은 아직 연결되지 않았다.
- AI HP 시스템은 아직 없고, 현재 전투 루프는 `player HP + AI stamina` 중심이다.
- 충돌 판정은 간단한 구형 hitbox 기반이며, 정교한 애니메이션 시스템은 아직 없다.
- 모바일 브라우저 대응과 저장 기능, 멀티플레이는 범위 밖이다.
- 웹캠 오버레이는 여전히 실제 사용자보다 왼쪽으로 크게 치우치는 현상이 남아 있다. 다음 세션에서는 `MediaPipe landmark raw x/y`, `video.videoWidth/video.videoHeight`, `canvas viewport`, `mirroring` 값을 동시에 시각화하는 디버그 모드를 먼저 넣고 좌표계를 직접 계측할 필요가 있다.
