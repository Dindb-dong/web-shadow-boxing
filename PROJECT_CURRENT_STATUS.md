# PROJECT CURRENT STATUS

Date: 2026-03-30

## Current Summary

Step 3 웹게임 MVP는 `Vite + TypeScript + Three.js + Docker` 기반 브라우저 클라이언트로 동작하며, 최근 UI 개선으로 `사용자 MediaPipe 포즈 오버레이`, `상반신 중심의 실제 GLB 아바타`, `좌/우 위빙 및 좌/우 더킹 기반 복싱 카운터 패턴`이 반영되었다. 실제 학습 모델은 아직 연결되지 않았으며, 팀원이 공유한 출력 스펙을 그대로 따르는 mock predictor가 기본 추론 엔진으로 들어가 있다. 이번 세션에서는 상단 중앙 AI HP 바를 추가하고, 회피 실패 시 AI HP가 감소하도록 연결했으며, 카운터 애니메이션도 몸통 회전과 반대손 가드를 포함하는 더 큰 공격 모션으로 강화했다. 오버레이는 다시 mirrored preview 기준으로 맞춰 좌우 팔 대응이 어긋나지 않도록 되돌렸다.

## Current Behavior

1. 브라우저에서 웹캠 권한을 요청하고 MediaPipe Pose로 `nose`, 양손 `shoulder/elbow/wrist`를 추적한다.
2. 최근 12프레임을 유지하면서 어깨 중심/어깨 거리 기준 정규화, 위치/속도/가속도 계산을 통해 `(12, 54)` 시퀀스를 생성한다.
3. mock predictor는 모델 출력 계약인 `state_idx`, `state_name`, `attacking_prob`, `traj(2, 6, 3)`, `raw` 형태로 결과를 반환한다.
4. 예측 궤도는 Three.js 씬에서 반투명 빨간 실린더 형태로 잠깐 표시된다.
5. 웹캠 패널에는 MediaPipe 스타일 2D 스켈레톤 오버레이가 그려지며, 현재는 전체 포즈 대신 `코/어깨/팔꿈치/손목` 중심의 상체 랜드마크만 표시한다.
6. 오버레이 캔버스에는 정렬 디버그 HUD가 함께 표시되며, 현재 프레임 기준 `선택된 상체 랜드마크 raw x/y`, `video.videoWidth/video.videoHeight`, `canvas width/height`, `object-fit: cover 계산 결과`, `미러링 전/후 화면 좌표`를 같은 화면에서 바로 확인할 수 있다.
7. 디버그 HUD는 `nose -> wrists -> shoulders -> elbows` 우선순위로 보이는 랜드마크 하나를 probe로 선택하고, `pre/post` 세로 가이드와 `cover viewport` 경계선을 함께 그린다.
8. 오버레이 실제 렌더링은 mirrored webcam preview에 맞춰 `post-mirror` 좌표를 사용한다. 따라서 셀피 화면에서 좌우 팔 표시가 뒤바뀌지 않는다.
9. AI는 임시 캡슐 지오메트리 대신 로컬에 저장된 인간형 GLB 아바타를 로드하며, 카메라와 모델 위치를 조정해 골반 위 중심의 스파링 상대처럼 보이도록 연출한다.
10. AI는 기본적으로 헤드 무브먼트와 가드 자세를 유지하고, 위협 궤적이 감지되면 `left/right weave`, `left/right duck` 중 하나로 회피한다.
11. 회피 후에는 방향과 회피 종류에 맞는 정형화된 카운터 조합을 사용한다. 예를 들면 같은 방향 훅/어퍼 또는 반대손 스트레이트가 교대로 나온다.
12. 카운터 시에는 활성 글러브만 앞으로 나가는 수준이 아니라 몸통 yaw/roll/pitch, 전진 드라이브, 반대손 가드가 함께 적용되어 스트레이트/훅/어퍼 모션 차이가 더 분명하게 보인다.
13. AI가 스태미나 부족으로 회피에 실패하면 유저 공격이 적중한 것으로 간주해 AI HP가 감소한다.
14. 반격 시 유저 손목이 코 근처면 guard 성공으로 처리하고, 아니면 player HP가 감소한다.
15. HUD에는 상단 중앙 AI HP, player HP, AI stamina, 추적 상태, 모델 상태, 공격 확률, 가드 결과가 표시된다.

## Architecture Notes

- 프론트엔드는 `src/pose`, `src/model`, `src/game`, `src/render`, `src/ui`, `src/types`로 역할을 분리했다.
- `PoseSequenceBuffer`가 짧은 추적 누락을 흡수하고 model-ready feature sequence를 제공한다.
- `CombatSystem`은 회피, 스태미나 회복/소모, 반격, 가드 판정을 독립적으로 관리한다.
- `PoseOverlayRenderer`가 비디오 원본 비율과 카드 비율 차이를 계산해 2D 캔버스를 보정한 뒤, 현재는 상체 랜드마크만 웹캠 프리뷰 위에 오버레이한다.
- 비디오 엘리먼트는 CSS transform으로 좌우 반전하고, 오버레이는 `poseOverlay.ts`에서 mirrored preview에 맞는 `post-mirror` 좌표를 사용해 그린다. 같은 모듈에서 비교용 raw/pre 좌표와 cover viewport 계측값도 함께 렌더링한다.
- `CombatSystem`은 방향성 있는 dodge 타입과 structured counter move를 함께 관리한다.
- `CombatSystem`은 이제 `player HP + AI HP + AI stamina`를 함께 관리하며, 회피 실패 시 incoming threat를 AI 피격으로 처리한다.
- Three.js 씬은 인간형 GLB 캐릭터, 링 스타일 무대, 헤드 무브먼트, 붉은 궤도 시각화를 담당한다.
- `SceneManager`는 카운터 모션별 punch profile을 분기해 글러브 위치, torso 회전, 무게 중심 이동을 함께 애니메이션한다.

## Operational Notes

- 현재 기본 predictor는 mock 구현이다. 실제 ONNX/TF.js 모델이 준비되면 predictor 구현체만 교체하는 방향으로 설계되어 있다.
- MediaPipe 모델과 wasm은 런타임에 원격 에셋을 사용한다.
- AI 아바타는 `Get3DModels`의 무료 GLB 에셋을 로컬 `public/assets/animated_human_by_get3dmodels.glb`로 보관해 로드한다.
- 실행과 테스트는 Docker 기준으로 맞췄으며, `docker compose up app`, `docker compose run --rm test` 흐름을 사용한다.
- 최근 수정으로 아바타가 안 보이던 문제는 해결되었고, AI가 유저 쪽을 바라보도록 회전값을 수정했다.
- 이번 HUD/전투/오버레이 수정 후 `docker compose run --rm test`, `docker compose run --rm app npm run build`를 다시 통과했다.

## Current Limitations

- 실제 Step 2 모델 파일은 아직 연결되지 않았다.
- 충돌 판정은 간단한 구형 hitbox 기반이며, 정교한 애니메이션 시스템은 아직 없다.
- 모바일 브라우저 대응과 저장 기능, 멀티플레이는 범위 밖이다.
- 웹캠 오버레이는 raw/cover/mirror 값을 같은 화면에서 계측할 수 있고, 현재 렌더링 기준은 mirrored preview와 맞춘 `post` 좌표다. 다음 세션에서는 이 상태에서 실제 코/손목 정렬이 충분히 맞는지 다시 보고, 남은 오차가 있으면 `object-position`, 부모 레이아웃, 입력 소스 좌표 차이 중 어느 쪽인지 추가로 좁혀야 한다.
