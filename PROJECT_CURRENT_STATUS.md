# PROJECT CURRENT STATUS

Date: 2026-03-31

## Current Summary

Step 3 웹게임 MVP는 `Vite + TypeScript + Three.js + Docker` 기반 브라우저 클라이언트로 동작하며, 최근 UI 개선으로 `사용자 MediaPipe 포즈 오버레이`, `상반신 중심의 실제 GLB 아바타`, `좌/우 위빙 및 좌/우 더킹 기반 복싱 카운터 패턴`이 반영되었다. 실제 학습 모델은 아직 연결되지 않았으며, 팀원이 공유한 출력 스펙을 그대로 따르는 mock predictor가 기본 추론 엔진으로 들어가 있다. 이번 세션에서는 전투 루프를 다시 바꿔, 유저 공격이 시작되면 AI가 현재 스태미나에 비례한 확률로 dodge를 고르고, 성공 시 counter를 한 번에 판정하지 않고 `회피 후 0.3초에 발사`, `발사 후 0.5초에 방어/피격 판정`의 2단계로 처리하도록 바꿨다. counter 판정 시점에 유저 얼굴이 원래 목표점에 남아 있으면 player HP가 감소하고, 손/팔로 막거나 z축 뒤로 스웨이해서 빠지면 defended counter로 처리된다. 또한 counter를 준비 중인 AI는 회피하지 못하는 무방비 상태가 되어, 유저가 그 타이밍에 얼굴 적중 공격을 넣으면 더 큰 피해를 받고 counter도 끊긴다. 이번 추가 수정으로 Three.js 전투 공간도 미러링된 웹캠 기준과 같은 좌우 방향을 쓰도록 맞췄고, 예측 궤도는 생성된 뒤 1초 동안 서서히 흐려지는 trail로 남는다. 우측 상단 통계는 `Successful Hits`와 `Defended Counters`를 표시하고, 웹캠 없이 AI 모션만 빠르게 재생해보는 정적 테스트 페이지들도 함께 추가했다. 추가로 dodge 좌우 선택을 절대 위치 단일 기준에서 `궤적 중심 + 횡방향 이동` 가중치 기반으로 바꾸고, 중립 신호가 반복되면 이전과 반대 방향을 우선 선택하도록 조정해 한쪽 방향 고정 회피를 완화했다. Scene 애니메이션도 dodge 방향에 따라 반대 어깨가 앞으로 나오도록 torso yaw/roll을 넣어 좌측 이동 시 우측 어깨 리드, 우측 이동 시 좌측 어깨 리드가 보이도록 바꿨다. 이번에 공격 상태 판정은 `AttackDetector`(10프레임 버퍼, 속도/가속도/신장률/z-depth 기반 확률 + 히스테리시스)로 교체했고, 궤도 렌더링은 풀링 기반 실린더 재사용으로 바꿔 idle 오탐 상황의 궤도 난사와 렌더링 부하를 함께 줄였다.

## Current Behavior

1. 브라우저에서 웹캠 권한을 요청하고 MediaPipe Pose로 `nose`, 양손 `shoulder/elbow/wrist`를 추적한다.
2. 최근 12프레임을 유지하면서 어깨 중심/어깨 거리 기준 정규화, 위치/속도/가속도 계산을 통해 `(12, 54)` 시퀀스를 생성한다.
3. mock predictor는 모델 출력 계약인 `state_idx`, `state_name`, `attacking_prob`, `traj(2, 6, 3)`, `raw` 형태로 결과를 반환하며, 공격 확률은 `AttackDetector`의 확률 스코어를 사용한다.
4. 예측 궤도는 공격 상태에서만 생성되며, Three.js 씬에서 풀링된 반투명 빨간 실린더를 재사용해 표시된다. 각 세그먼트는 1초 동안 서서히 흐려지고, emit 빈도는 `최대 4개/초`로 제한된다.
5. 웹캠 패널에는 MediaPipe 스타일 2D 스켈레톤 오버레이가 그려지며, 현재는 전체 포즈 대신 `코/어깨/팔꿈치/손목/엄지/검지/새끼손가락` 중심의 상체 랜드마크만 표시한다.
6. 오버레이 캔버스에는 정렬 디버그 HUD가 함께 표시되며, 현재 프레임 기준 `선택된 상체 랜드마크 raw x/y`, `video.videoWidth/video.videoHeight`, `canvas width/height`, `object-fit: cover 계산 결과`, `미러링 전/후 화면 좌표`를 같은 화면에서 바로 확인할 수 있다.
7. 디버그 HUD는 `nose -> wrists -> shoulders -> elbows` 우선순위로 보이는 랜드마크 하나를 probe로 선택하고, `pre/post` 세로 가이드와 `cover viewport` 경계선을 함께 그린다.
8. 오버레이 실제 렌더링은 현재 mirrored webcam preview에 맞춰 모든 상체 랜드마크를 `post-mirror` 좌표로 그리는 상태다.
9. AI는 임시 캡슐 지오메트리 대신 로컬에 저장된 인간형 GLB 아바타를 로드하며, 카메라와 모델 위치를 조정해 골반 위 중심의 스파링 상대처럼 보이도록 연출한다.
10. AI는 기본적으로 헤드 무브먼트와 가드 자세를 유지하고, 유저 공격이 시작되면 현재 스태미나 비율이 높을수록 더 높은 확률로 회피를 시도한다. 회피 좌우는 `궤적 중심 위치 + 횡방향 이동량` 신호를 섞어 확률적으로 고르고, 신호가 중립인 상황이 반복되면 이전과 반대 방향을 우선해 한쪽으로만 피하는 편향을 줄였다.
11. 회피에 성공한 경우에만 방향과 회피 종류에 맞는 정형화된 카운터 조합을 준비한다. 예를 들면 같은 방향 훅/어퍼 또는 반대손 스트레이트가 교대로 나온다.
12. counter는 회피 직후 바로 적중 판정을 내는 것이 아니라, 회피 시점의 유저 얼굴 월드 좌표를 저장한 뒤 `0.3초 후`에 먼저 발사한다.
13. counter 발사 `0.5초 후`에 유저가 그 목표 좌표에 남았는지(피격), 손/팔로 막았는지(block), z축 뒤로 빠졌는지(sway)를 판정한다.
14. counter 시점에 유저 얼굴 대신 손/팔이 목표 좌표에 있으면 block으로 간주하고, 유저 얼굴이 목표 z보다 더 뒤로 빠져 있으면 sway dodge로 간주한다. 두 경우 모두 `Defended Counters`가 증가한다.
15. AI HP는 이제 유저 주먹 예측 궤도가 AI 얼굴 hitbox에 닿고, 그 공격에서 AI가 dodge를 고르지 않았을 때 감소한다.
16. AI가 counter를 준비 중인 `primed` 상태에서는 회피가 비활성화되며, 유저가 이 타이밍에 얼굴 적중 공격을 넣으면 일반 적중보다 더 큰 피해를 주고 counter를 끊을 수 있다.
17. HUD에는 상단 중앙 AI HP, player HP, AI stamina, 추적 상태, 모델 상태, 공격 확률, 가드 결과가 표시된다.
18. HUD 우측 상단에는 현재 게임 버전과 함께 `Successful Hits`, `Defended Counters` 누적 수치가 항상 보인다.
19. AI 반격용 빨간 구체 글러브는 기본 상태에서는 숨겨져 있고, counter 애니메이션을 재생할 때만 나타난다.
20. AI 스태미나는 이전보다 느리게 회복되며, stamina가 높을수록 dodge 확률도 높아진다.
21. `/combat-test-hub.html` 에서는 웹캠 없이 모션 테스트 페이지 목록을 볼 수 있고, `/counter-sequence-test.html`, `/counter-blocked-test.html`, `/counter-sway-test.html` 에서는 버튼 한 번으로 각 AI 시나리오를 재생할 수 있다.
22. dodge 애니메이션 중 아바타 torso는 이동 방향 반대쪽 어깨가 리드하도록 회전한다. 즉 `left_*` 회피에서는 우측 어깨가, `right_*` 회피에서는 좌측 어깨가 전진한 형태로 보인다.

## Architecture Notes

- 프론트엔드는 `src/pose`, `src/model`, `src/game`, `src/render`, `src/ui`, `src/types`로 역할을 분리했다.
- `PoseSequenceBuffer`가 짧은 추적 누락을 흡수하고 model-ready feature sequence를 제공한다.
- `CombatSystem`은 회피 확률 계산, 스태미나 회복/소모, 얼굴 hitbox 기반 피격, 얼굴 좌표 기반 counter 타기팅, sway/block 판정, 세션 누적 전투 통계를 독립적으로 관리한다. 얼굴 피격은 궤적 점 샘플뿐 아니라 점 사이 선분이 얼굴 hitbox를 통과하는 경우도 판정한다.
- `PoseOverlayRenderer`가 비디오 원본 비율과 카드 비율 차이를 계산해 2D 캔버스를 보정한 뒤, 현재는 상체 랜드마크만 웹캠 프리뷰 위에 오버레이한다.
- 비디오 엘리먼트는 CSS transform으로 좌우 반전하고, 오버레이는 `poseOverlay.ts`에서 같은 preview에 맞춘 full mirror(`1 - x`) 좌표로 모든 상체 랜드마크를 그린다. 같은 모듈에서 비교용 pre/post 좌표와 cover viewport 계측값도 함께 렌더링한다.
- `CombatSystem`은 방향성 있는 dodge 타입과 structured counter move를 함께 관리하며, dodge 좌우를 궤적 위치/횡이동 기반 확률 샘플링으로 고른 뒤 중립 신호 반복 시 반대 방향으로 균형을 잡는다.
- `CombatSystem`은 이제 `player HP + AI HP + AI stamina + successful hits + guarded counters`를 함께 관리하며, attack start, dodge roll, counter target, vulnerable window, counter launch/resolve 타이밍을 상태로 들고 간다.
- Three.js 씬은 인간형 GLB 캐릭터, 링 스타일 무대, 헤드 무브먼트, 미러링된 좌표계 기준의 붉은 궤도 시각화를 담당한다.
- `AttackDetector`(`src/logic/AttackDetector.ts`)는 10프레임 버퍼에서 속도/가속도/팔 신장률/z-depth 변화를 추출해 sigmoid 확률을 만들고, `0.8/0.3` 히스테리시스로 `idle/attacking`을 안정화한다.
- `SceneManager`는 카운터 모션별 punch profile을 분기해 글러브 위치, torso 회전, 무게 중심 이동을 함께 애니메이션하며, 저장된 얼굴 목표 좌표 쪽으로 주먹이 향하도록 보정한다. dodge 중에는 이동 방향 반대쪽 어깨가 리드되도록 별도 torso yaw/roll을 적용한다. 위협 궤도는 레이어 누적 대신 `100개 풀링 세그먼트`를 재사용해 Catmull-Rom 기반 부드러운 경로로 렌더링하고 1초 fade-out 한다. 빨간 글러브 메쉬는 counter 중에만 노출한다.
- `src/pages` 아래 정적 테스트 런타임이 추가되어, 별도 HTML 엔트리포인트에서 `SceneManager`만 독립적으로 띄워 canned dodge/counter 시퀀스를 재생할 수 있다.
- `PoseTracker`는 이제 MediaPipe `pose_landmarker_full` 모델을 사용하고, 브라우저 카메라 요청도 `1280x720 / 60fps ideal`로 올려 추적 품질을 개선하도록 시도한다.
- 게임 버전은 `package.json`과 `src/version.ts`에서 `1.2.1`로 맞췄고, 앞으로 사소한 수정은 patch, 큰 수정은 minor를 올리는 규칙으로 관리한다.

## Operational Notes

- 현재 기본 predictor는 mock 구현이다. 실제 ONNX/TF.js 모델이 준비되면 predictor 구현체만 교체하는 방향으로 설계되어 있다.
- MediaPipe 모델과 wasm은 런타임에 원격 에셋을 사용한다.
- AI 아바타는 `Get3DModels`의 무료 GLB 에셋을 로컬 `public/assets/animated_human_by_get3dmodels.glb`로 보관해 로드한다.
- 실행과 테스트는 Docker 기준으로 맞췄으며, `docker compose up app`, `docker compose run --rm test` 흐름을 사용한다.
- 최근 수정으로 아바타가 안 보이던 문제는 해결되었고, AI가 유저 쪽을 바라보도록 회전값을 수정했다.
- 이번 좌우 미러링 수정, trail fade-out, 정적 테스트 페이지 추가까지 포함해 `docker compose run --rm app npm run test:run`, `docker compose run --rm app npm run build`를 다시 통과했다.
- 이번 dodge 방향 분산/스탠스 리드 수정 이후에도 `docker compose run --rm test`, `docker compose run --rm app npm run build`를 통과했다.
- 루트에 `AGENTS.md`(Repository Guidelines)를 추가해 구조, Docker 기반 실행/테스트 명령, 커밋/PR 규칙, 상태 문서 업데이트 규칙을 contributor 기준으로 명문화했다.
- `AGENTS.md`에 버전 정책을 명시해 `1.A.B` 체계를 사용하고, 큰 수정은 `A` 증가(및 `B=0` 리셋), 작은 수정은 `B` 증가 규칙으로 관리하도록 정리했다.
- counter 타이밍을 `회피 후 0.3초 발사 + 발사 후 0.5초 판정`으로 분리한 뒤에도 `docker compose run --rm test`, `docker compose run --rm app npm run build`를 통과했다.
- 공격 오탐/궤도 과생성 이슈 수정(AttackDetector + 궤도 풀링 + 공격시에만 궤도 생성) 뒤에도 `docker compose run --rm test`, `docker compose run --rm app npm run build`를 통과했다.
- 추가로 손목 visibility 기반 안전 게이트를 넣어 카메라에 팔이 안 보이면 모델 출력이 `idle/attacking_prob=0`으로 강제되고, 궤도 렌더 시작 임계치도 `0.68`로 높여 idle 구간 궤도 난사를 더 강하게 억제했다. 이 변경 후에도 `docker compose run --rm test`, `docker compose run --rm app npm run build`를 통과했다.
- 궤도 생성 레이트 제한(`4/sec`)과 선분 교차 기반 얼굴 피격 판정을 추가해, 시각적으로 얼굴을 가로지르는 궤도에서 HP가 닳지 않던 케이스를 보완했다. 이 변경 후에도 `docker compose run --rm test`, `docker compose run --rm app npm run build`를 통과했다.

## Current Limitations

- 실제 Step 2 모델 파일은 아직 연결되지 않았다.
- 충돌 판정은 여전히 간단한 구형 hitbox와 landmark 근접 거리 기반이며, 정교한 애니메이션 리깅이나 IK는 아직 없다.
- 모바일 브라우저 대응과 저장 기능, 멀티플레이는 범위 밖이다.
- production build는 통과하지만, 현재 번들에 `@mediapipe/tasks-vision`과 Three.js가 함께 포함돼 번들 크기 경고가 계속 남아 있다.
- 웹캠 오버레이는 raw/cover/mirror 값을 같은 화면에서 계측할 수 있고, 현재 렌더링 기준은 `full post-mirror`다. 다음 세션에서는 이 상태에서 실제 코/손목/손끝 정렬이 충분히 맞는지 다시 보고, 남은 오차가 있으면 `object-position`, 부모 레이아웃, 입력 소스 좌표 차이, 또는 MediaPipe 자체 좌표 편향 중 어느 쪽인지 추가로 좁혀야 한다.
