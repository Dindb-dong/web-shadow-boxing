# PROJECT CURRENT STATUS

Date: 2026-04-06

## Current Summary

Step 3 웹게임 MVP는 `Vite + TypeScript + Three.js + Docker` 기반 브라우저 클라이언트로 동작하며, 현재는 `사용자 MediaPipe 포즈 오버레이`, `실제 리깅된 Titan Boxer GLB 아바타`, `좌/우 위빙 및 좌/우 더킹 기반 복싱 카운터 패턴`을 유지한 채 공격 판정/궤도 계산을 `/Users/maxkim/boxer_ai` 파이프라인 기준으로 교체했다. 브라우저에서는 MediaPipe Pose를 `20 FPS`로 상시 실행하고, `pose_world_landmarks`의 `어깨/팔꿈치/손목 6개 관절 xyz`를 사용해 boxer_ai와 동일하게 `어깨 중심 이동 + 어깨 거리 정규화 + EMA smoothing(beta=0.3) + 위치/속도/가속도 54차 feature + 최근 12-step window`를 만든다. 기존 `MockPredictor`와 `AttackDetector`는 제거했고, 대신 boxer_ai의 실제 GRU 체크포인트(`checkpoints/gru_model.pt`)를 브라우저용 JSON 가중치로 export해 TypeScript 단일-layer GRU 런타임에서 직접 추론한다. 공격 판정과 trajectory emit은 모두 `attacking_prob >= 0.3` 기준으로 맞췄고, AI 회피 판정은 이제 world `z` 깊이보다 화면상 `XY` 경로를 우선해 예측된 1~6 step 손목 궤적 전체를 피하도록 계산한다. HP가 0이 되면 즉시 다운 모션을 재생한다. 이번 세션에서는 기존 가짜 sleeve arm overlay를 버리고, 외부에서 받은 `characters3d.com - Titan Boxer.glb`의 실제 humanoid skeleton(`Shoulder/Upper_Arm/Lower_Arm/Hand`)을 직접 구동하도록 바꿔 기본 가드와 카운터 주먹 뻗기가 아바타 본과 동기화되게 만들었다. MediaPipe task model도 원격 경로 대신 로컬 `public/assets/pose_landmarker_full.task`를 사용하도록 바꿨다.

## Current Behavior

1. 브라우저에서 웹캠 권한을 요청하고 MediaPipe Pose를 `20 FPS` background loop로 유지한다. 공격 계산에는 `pose_world_landmarks`의 `nose`, 양손 `shoulder/elbow/wrist`를 사용하고, 오버레이는 기존처럼 2D normalized landmarks를 그대로 그린다.
2. 최근 3개의 normalized pose에 대해 boxer_ai와 동일하게 EMA smoothing 후 위치/속도/가속도를 계산해 프레임당 `54`차 feature를 만들고, 최근 `12`개 feature window를 유지한다.
3. 기본 추론 엔진은 더 이상 mock heuristic이 아니라 boxer_ai GRU 체크포인트를 TypeScript 런타임으로 실행하는 `BoxerAiPredictor`다. 출력 계약은 `state_idx`, `state_name`, `attacking_prob`, `traj(2, 6, 3)`, `raw`를 유지한다.
4. 예측 궤도는 최신 GRU 출력으로 바로 계산되며, 기존 `trajectoryToWorld()`를 통해 Three.js 상대 평면 쪽으로 투영된다. trajectory는 `idle -> attacking` 위협 엣지에서만 한 번 emit되고, 붉은 trail은 1초 동안 서서히 흐려진다.
5. 웹캠 패널의 MediaPipe 스타일 2D 스켈레톤 오버레이는 유지되며, 현재도 `코/어깨/팔꿈치/손목/엄지/검지/새끼손가락` 중심의 상체 랜드마크만 표시한다.
6. 오버레이 캔버스에는 정렬 디버그 HUD가 함께 표시되며, 현재 프레임 기준 `선택된 상체 랜드마크 raw x/y`, `video.videoWidth/video.videoHeight`, `canvas width/height`, `object-fit: cover 계산 결과`, `미러링 전/후 화면 좌표`를 같은 화면에서 바로 확인할 수 있다.
7. 디버그 HUD는 `nose -> wrists -> shoulders -> elbows` 우선순위로 보이는 랜드마크 하나를 probe로 선택하고, `pre/post` 세로 가이드와 `cover viewport` 경계선을 함께 그린다.
8. 오버레이 실제 렌더링은 현재 mirrored webcam preview에 맞춰 모든 상체 랜드마크를 `post-mirror` 좌표로 그리는 상태다.
9. AI는 임시 캡슐 지오메트리 대신 로컬 `public/assets/characters3d.com - Titan Boxer.glb` 리깅된 복서 GLB 아바타를 로드하며, 카메라와 모델 위치를 조정해 골반 위 중심의 스파링 상대처럼 보이도록 연출한다.
10. AI는 기본적으로 헤드 무브먼트와 가드 자세를 유지하고, 유저 공격이 시작돼 `avatarThreat`가 성립하면 stamina가 남아 있는 한 랜덤 없이 즉시 회피를 시도한다. 회피 좌우는 `궤적 중심 위치 + 횡방향 이동량` 신호를 섞어 확률적으로 고르고, 신호가 중립인 상황이 반복되면 이전과 반대 방향을 우선해 한쪽으로만 피하는 편향을 줄였다.
11. 회피에 성공한 경우에만 방향과 회피 종류에 맞는 정형화된 카운터 조합을 준비한다. 예를 들면 같은 방향 훅/어퍼 또는 반대손 스트레이트가 교대로 나온다.
12. counter는 회피 직후 바로 적중 판정을 내는 것이 아니라, 회피 시점의 유저 얼굴 월드 좌표를 저장한 뒤 `0.3초 후`에 먼저 발사한다.
13. counter 발사 `0.5초 후`에 유저가 그 목표 좌표에 남았는지(피격), 손/팔로 막았는지(block), z축 뒤로 빠졌는지(sway)를 판정한다.
14. counter 시점에 유저 얼굴 대신 손/팔이 목표 좌표에 있으면 block으로 간주하고, 유저 얼굴이 목표 z보다 더 뒤로 빠져 있으면 sway dodge로 간주한다. 두 경우 모두 `Defended Counters`가 증가한다.
15. AI HP는 유저 주먹 예측 궤도가 AI `avatar hitbox`에 닿고, 그 공격에서 dodge에 실패했거나 dodge 분기로 들어가지 못했을 때 감소한다. 예전 `face-only overlap` 의존은 제거했다. HP가 `0`이 되면 추가 회피/카운터 진입 없이 즉시 `Victory. AI is down` 상태로 고정된다.
16. AI가 counter를 준비 중인 `primed` 상태에서는 회피가 비활성화되며, 유저가 이 타이밍에 적중 공격을 넣으면 일반 적중보다 더 큰 피해를 주고 counter를 끊을 수 있다.
17. HUD에는 상단 중앙 AI HP, player HP, AI stamina, 추적 상태, 모델 상태, 공격 확률, 가드 결과가 표시된다. 추가로 Debug HUD에서 `raw threat`, `raw attacking prob`, `last emit raw prob`, `left/right wrist visibility`, `prediction gated`, `combat overlap`, `dodge chance/roll`, `attackStarted edge`, 최근 이벤트 로그를 바로 볼 수 있다.
18. HUD 우측 상단에는 현재 게임 버전과 함께 `Successful Hits`, `Defended Counters` 누적 수치가 항상 보인다.
19. 빨간 링 로프 토러스는 제거했고, 현재 무대는 어두운 플랫폼 중심으로만 보인다.
20. AI 반격용 빨간 글러브는 이제 기본 상태에서도 항상 얼굴 앞 가드 위치에 보이며, 위치 계산은 가짜 overlay arm이 아니라 실제 `L/R Shoulder, Upper Arm, Lower Arm, Hand` 본 움직임과 동기화된다.
21. counter가 시작되면 active glove는 guard에서 바로 뻗어나가고, 같은 프레임에 실제 upper arm/lower arm/hand 본이 함께 회전해 빨간 글러브가 아바타의 주먹과 끊기지 않고 연결된 펀치처럼 보인다.
22. AI 스태미나는 이전보다 느리게 회복되며, stamina가 높을수록 dodge 확률도 높아진다.
23. `/combat-test-hub.html` 에서는 웹캠 없이 모션 테스트 페이지 목록을 볼 수 있고, `/counter-sequence-test.html`, `/counter-blocked-test.html`, `/counter-sway-test.html` 에서는 버튼 한 번으로 각 AI 시나리오를 재생할 수 있다.
24. dodge 애니메이션 중 아바타 torso는 이동 방향 반대쪽 어깨가 리드하도록 회전한다. 즉 `left_*` 회피에서는 우측 어깨가, `right_*` 회피에서는 좌측 어깨가 전진한 형태로 보인다.
25. 손목 visibility가 기준치 아래로 떨어지면 predictor 출력은 combat에 전달되지 않고 `wrists-hidden` 또는 `tracking-unready`로 gated 처리된다.

## Architecture Notes

- 프론트엔드는 `src/pose`, `src/model`, `src/game`, `src/render`, `src/ui`, `src/types`로 역할을 분리했다.
- `PoseSequenceBuffer`는 최근 3개 normalized pose와 최근 12개 feature frame을 유지하며 boxer_ai와 같은 모델 입력 window를 제공한다.
- `CombatSystem`은 stamina 기반 강제 회피, 스태미나 회복/소모, avatar hitbox 기반 피격, 얼굴 좌표 기반 counter 타기팅, sway/block 판정, 세션 누적 전투 통계를 독립적으로 관리한다. 피격/회피는 world 경로의 `z` 일치 여부보다 화면상 `XY` 궤적 점열과 선분이 아바타 실루엣을 통과하는지를 우선해 판정한다.
- `ShadowboxingGame`은 raw predictor output을 매 샘플마다 계산하고, `threatAssessment.ts`에서 `attackStarted` 성격의 위협 엣지를 판정해 trajectory emit 시점을 제어한다. 같은 순간의 predictor output이 `CombatSystem`, trajectory render, Debug HUD, 브라우저 콘솔 로그에 공통으로 전달된다.
- `worldMapping.ts`는 현재 pose landmark 자체를 world space로 옮기는 `mapBodyPointToWorld`와, normalized wrist trajectory를 상대 전투공간용 위협 경로로 투영하는 `trajectoryToWorld`를 분리된 역할로 운영한다. 후자는 어깨 anchor 대비 extension, horizon progress, x축 중앙 수렴, wide hook 감지 기반 측면 spread 유지, 얼굴 높이 pull, 상대 face plane depth projection을 함께 적용한다.
- `PoseOverlayRenderer`가 비디오 원본 비율과 카드 비율 차이를 계산해 2D 캔버스를 보정한 뒤, 현재는 상체 랜드마크만 웹캠 프리뷰 위에 오버레이한다.
- 비디오 엘리먼트는 CSS transform으로 좌우 반전하고, 오버레이는 `poseOverlay.ts`에서 같은 preview에 맞춘 full mirror(`1 - x`) 좌표로 모든 상체 랜드마크를 그린다. 같은 모듈에서 비교용 pre/post 좌표와 cover viewport 계측값도 함께 렌더링한다.
- `CombatSystem`은 방향성 있는 dodge 타입과 structured counter move를 함께 관리하며, avatarThreat와 dodge 진입을 같은 분기로 묶어 stamina가 충분하면 항상 dodge를 우선한다. dodge 좌우는 궤적 위치/횡이동 기반 확률 샘플링으로 고른 뒤 중립 신호 반복 시 반대 방향으로 균형을 잡는다.
- `CombatSystem`은 이제 `player HP + AI HP + AI stamina + successful hits + guarded counters`를 함께 관리하며, attack start, dodge roll, counter target, vulnerable window, counter launch/resolve 타이밍을 상태로 들고 간다.
- Three.js 씬은 리깅된 Titan Boxer GLB 캐릭터, 어두운 플랫폼 무대, 헤드 무브먼트, 미러링된 좌표계 기준의 붉은 궤도 시각화를 담당한다.
- `SceneManager`는 카운터 모션별 punch profile을 분기해 글러브 위치, torso 회전, 무게 중심 이동을 함께 애니메이션하며, 저장된 얼굴 목표 좌표 쪽으로 주먹이 향하도록 보정한다. 동시에 imported humanoid skeleton의 `Shoulder -> Upper Arm -> Lower Arm -> Hand` 체인을 직접 풀어 기본 가드 자세와 counter 펀치 연결감을 유지한다. dodge 중에는 이동 방향 반대쪽 어깨가 리드되도록 별도 torso yaw/roll을 적용한다. 위협 궤도는 combat 판정에 쓰는 raw path와 동일한 점열을 그대로 렌더링하고 1초 fade-out 한다. 빨간 글러브 메쉬는 idle/counter 모두에서 hand bone 위치에 동기화되며, AI HP가 0이 되면 별도 down/victory 모션을 재생한다.
- `src/pages` 아래 정적 테스트 런타임이 추가되어, 별도 HTML 엔트리포인트에서 `SceneManager`만 독립적으로 띄워 canned dodge/counter 시퀀스를 재생할 수 있다.
- `PoseTracker`는 MediaPipe `pose_landmarker_full` 모델을 사용하고, `1280x720 / 20fps ideal` 카메라 스트림과 background sample loop를 유지한다.
- 게임 버전은 `package.json`과 `src/version.ts`에서 `1.3.12`로 맞췄고, 앞으로 사소한 수정은 patch, 큰 수정은 minor를 올리는 규칙으로 관리한다.

## Operational Notes

- AI 아바타는 외부에서 받은 rigged GLB 에셋 `characters3d.com - Titan Boxer.glb`를 로컬 `public/assets/characters3d.com - Titan Boxer.glb`로 보관해 로드한다.
- 실행과 테스트는 Docker 기준으로 맞췄으며, `docker compose up app`, `docker compose run --rm test` 흐름을 사용한다.
- 최근 수정으로 아바타가 안 보이던 문제는 해결되었고, AI가 유저 쪽을 바라보도록 회전값을 수정했다.
- 이번 좌우 미러링 수정, trail fade-out, 정적 테스트 페이지 추가까지 포함해 `docker compose run --rm app npm run test:run`, `docker compose run --rm app npm run build`를 다시 통과했다.
- 이번 dodge 방향 분산/스탠스 리드 수정 이후에도 `docker compose run --rm test`, `docker compose run --rm app npm run build`를 통과했다.
- 루트에 `AGENTS.md`(Repository Guidelines)를 추가해 구조, Docker 기반 실행/테스트 명령, 커밋/PR 규칙, 상태 문서 업데이트 규칙을 contributor 기준으로 명문화했다.
- `AGENTS.md`에 버전 정책을 명시해 `1.A.B` 체계를 사용하고, 큰 수정은 `A` 증가(및 `B=0` 리셋), 작은 수정은 `B` 증가 규칙으로 관리하도록 정리했다.
- counter 타이밍을 `회피 후 0.3초 발사 + 발사 후 0.5초 판정`으로 분리한 뒤에도 `docker compose run --rm test`, `docker compose run --rm app npm run build`를 통과했다.
- 공격 오탐/궤도 과생성 이슈 수정(AttackDetector + 궤도 풀링 + 공격시에만 궤도 생성) 뒤에도 `docker compose run --rm test`, `docker compose run --rm app npm run build`를 통과했다.
- 추가로 손목 visibility 기반 안전 게이트를 넣어 카메라에 팔이 안 보이면 predictor 출력이 combat에 전달되지 않도록 막았고, idle 구간 궤도 난사 억제를 위해 emit 임계치도 조정했다. 이 변경 후에도 `docker compose run --rm test`, `docker compose run --rm app npm run build`를 통과했다.
- 궤도 생성 레이트 제한(`4/sec`)과 선분 교차 기반 얼굴 피격 판정을 추가해, 시각적으로 얼굴을 가로지르는 궤도에서 HP가 닳지 않던 케이스를 보완했다. 이 변경 후에도 `docker compose run --rm test`, `docker compose run --rm app npm run build`를 통과했다.
- 이번 세션에서는 mock predictor trajectory의 world-space 투영을 `팔 신장 기반 위협 투영`으로 교체하고, 실제 punch-like pose sequence가 predictor -> world mapping -> combat hit까지 이어지는 회귀 테스트를 추가했다. 이 변경 후에도 `docker compose run --rm test`, `docker compose run --rm app npm run build`를 통과했다.
- 이번 세션에서는 `/Users/maxkim/boxer_ai`의 README/전처리/GRU 구조를 기준으로 웹앱 공격 계산 체인을 전면 교체했다. `20 FPS 상시 MediaPipe`, `world landmark 기반 6관절 추출`, `normalize + smooth + 54차 feature + 12-step window`, `브라우저 내 GRU 추론`, `기존 2D 포즈 오버레이 유지`, `로컬 pose_landmarker_full.task 사용`까지 반영했고, 이후 `docker compose run --rm test`, `docker compose run --rm app npm run build`를 다시 통과했다.
- 이번 추가 수정에서는 연속 `attacking` 출력 동안 trail을 계속 재생성하지 않도록 `threat rising edge`에서만 trajectory를 한 번 emit하도록 바꿨다. 동시에 AI 피격 판정은 기존 정적 face-only 기준을 버리고 `avatar hitbox` 기준으로 정리해, 화면상 아바타를 실제로 스친 trajectory가 HP 감소로 더 일관되게 이어지도록 조정했다. 이 변경 후에도 `docker compose run --rm test`, `docker compose run --rm app npm run build`를 통과했다.
- 이번 추가 디버그 수정에서는 브라우저 Debug HUD에 `left/right wrist visibility`, `prediction gated reason`, `raw attacking_prob`를 개별 라인으로 노출해 현장 카메라 세팅에서 오탐 원인을 바로 확인할 수 있게 했다. 이 변경 후에도 `docker compose run --rm test`, `docker compose run --rm app npm run build`를 통과했다.
- 이번 후속 수정에서는 남성 파이터 GLB 아바타를 `muscular_bodybuilder_boxing_fighter.glb`로 교체하고, 붉은 링 로프를 제거했으며, wide hook trajectory가 화면 측면에서 중앙으로 더 넓게 들어오도록 x축 수렴을 완화했다. 동시에 AI 회피 로직을 avatarThreat 분기와 직접 묶어 stamina가 남아 있으면 랜덤 없이 바로 dodge로 들어가도록 바꿨고, AI HP가 0이 되면 추가 방어 행동 없이 즉시 down/victory 모션을 재생하도록 정리했다. 이 변경 후 `docker compose run --rm test`, `docker compose run --rm app npm run build`를 통과했고, 최종 버전 표기는 `1.3.0`이다.
- 이번 추가 연출 수정에서는 `SceneManager`에 boxer-style arm rig를 얹어 양손 빨간 글러브가 기본 상태에서도 얼굴 앞 가드를 유지하도록 바꿨다. 초기 고정 좌표 버전은 GLB 위에서 팔이 떠 보이는 문제가 있었고, 후속 보정으로 로드된 메쉬 bounds 기준으로 어깨/가드 앵커를 다시 산출하도록 수정했다. counter가 발사되면 active glove가 목표 좌표 쪽으로 직접 뻗고, 상완/전완 sleeve도 같은 pose solver로 함께 따라가도록 해 빨간 공이 아바타의 주먹과 끊기지 않게 만들었다. 이 변경 후 `docker compose run --rm test`, `docker compose run --rm app npm run build`를 다시 통과했고, 현재 버전 표기는 `1.3.1`이다.
- 이번 후속 리깅 동기화 수정에서는 외부 rigged 에셋 `characters3d.com - Titan Boxer.glb`로 아바타를 교체하고, fake sleeve arm overlay를 렌더 기준에서 제외했다. 대신 실제 humanoid bone chain을 직접 풀어 양팔 가드와 카운터 펀치를 본 단위로 동기화했고, 빨간 글러브 메쉬는 hand bone 위치를 따라가도록 정리했다. 이 변경 후 `docker compose run --rm test`, `docker compose run --rm app npm run build`를 다시 통과했고, 현재 버전 표기는 `1.3.2`이다.
- 이번 후속 좌우 보정에서는 anatomical `L/R` bone 이름을 그대로 믿지 않고, 실제 upper arm의 local x 좌표를 읽어 화면 기준 `screen-left/screen-right` 팔로 재매핑하도록 수정했다. 동시에 shoulder 회전 강도를 낮춰 팔과 어깨가 머리 뒤로 과하게 꺾이는 현상을 줄였고, 이 매핑을 고정하는 회귀 테스트를 추가했다. 현재 버전 표기는 `1.3.3`이다.
- 이번 추가 전면 보정에서는 rigged arm의 손목 타깃과 빨간 글러브 위치를 avatar 본 축이 아니라 실제 카메라 방향 쪽으로 약간 bias해, 가드 주먹이 목 뒤로 숨지 않고 얼굴 앞에 남도록 조정했다. 동시에 elbow pole을 더 아래로 내려 복서처럼 팔꿈치가 떨어지는 실루엣을 유도했고, 이 camera-bias 헬퍼에 대한 회귀 테스트를 추가했다. 현재 버전 표기는 `1.3.4`이다.
- 이번 추가 가드 보정에서는 rigged boxer의 기본 guard anchor를 머리 중심 기준이 아니라 `각 어깨 + 얼굴 반면` 기준으로 다시 잡아, 기본 스탠스에서 양 전완이 코 앞에서 교차하지 않도록 벌렸다. 동시에 left/right guard x를 자기 반면에 고정하는 회귀 테스트를 추가했고, 현재 버전 표기는 `1.3.5`이다.
- 이번 추가 간격 보정에서는 기본 가드의 `left/right guard x`를 더 바깥으로 벌리고, 빨간 글러브 메쉬의 hand-bone 오프셋도 중앙이 아니라 바깥쪽으로 옮겨 정면에서 주먹 두 개가 겹쳐 보이지 않도록 조정했다. 현재 버전 표기는 `1.3.6`이다.
- 이번 추가 복서 보정에서는 Titan Boxer 에셋의 실제 finger chain(`Index/Middle/Ring/Thumb`)까지 함께 구동해 손을 fist pose 쪽으로 말고, 기본 guard z와 글러브 위치를 더 전방으로 보정했다. 동시에 elbow pole을 더 안쪽/아래쪽으로 바꿔 팔꿈치가 옆으로 벌어지지 않게 만들었고, guard depth / elbow tuck 회귀 테스트를 추가했다. 현재 버전 표기는 `1.3.7`이다.
- 이번 후속 손/가드 보정에서는 손가락 curl 축을 손가락 local x 중심으로 다시 맞춰 손이 옆으로 펴지지 않게 조정했고, hand roll도 크게 줄였다. 동시에 기본 가드는 `덜 전방 + 더 높은 y`로 재설정해 팔이 지나치게 앞으로 뻗어 보이지 않도록 조정했고, guard y/z 회귀 테스트를 추가했다. 현재 버전 표기는 `1.3.8`이다.
- 이번 추가 내회전 보정에서는 upper arm / lower arm에 축방향 inward twist를 넣어 손바닥이 얼굴 쪽을 향하도록 조정했고, hand/finger pose는 과한 claw를 줄이는 쪽으로 다시 다듬었다. 동시에 guard는 더 높게 올리고 전방 bias는 다시 줄여, 기본 자세가 뻗은 자세가 아니라 접힌 복서 가드에 가깝게 보이도록 조정했다. 현재 버전 표기는 `1.3.9`이다.
- 이번 후속 재보정에서는 손가락 본을 더 강하게 접는 대신 finger scale도 함께 줄여 글러브 안쪽으로 정리되도록 바꿨고, glove mesh는 다시 손보다 앞쪽으로 덮이게 보정했다. 동시에 upper/lower arm inward twist를 더 키워 손바닥이 얼굴 쪽을 더 분명히 향하도록 조정했고, guard 높이/전방 거리도 다시 균형점으로 되돌렸다. 현재 버전 표기는 `1.3.10`이다.
- 이번 후속 모델 갱신에서는 exporter가 외부 절대경로가 아니라 로컬 `checkpoints/gru_model.pt`를 읽도록 바꿨고, 팀원이 전달한 새 `.pt` 체크포인트를 브라우저용 `src/model/assets/boxerAiWeights.json`으로 다시 export했다. 현재 버전 표기는 `1.3.11`이다.
- 이번 후속 추론 튜닝에서는 팀원이 전달한 운영 가이드에 맞춰 pose EMA beta를 `0.3`으로 낮추고, 공격/trajectory emit 임계치를 `attacking_prob >= 0.3`으로 통일했다. 동시에 AI 회피 판정은 3D depth 일치보다 예측된 1~6 step 손목 궤적의 `XY` 폴리라인 전체가 아바타 실루엣을 지나는지 기준으로 바꿨고, 이에 대한 회귀 테스트를 추가했다. 현재 버전 표기는 `1.3.12`이다.

## Current Limitations

- boxer_ai 체크포인트를 브라우저용 JSON으로 export해 포함했기 때문에, 추론 경로는 실제 모델 기반으로 동작한다. 다만 현재는 단일 체크포인트 고정 번들링이라 모델 hot-swap이나 런타임 다운로드 전환은 아직 없다.
- 충돌 판정은 여전히 간단한 구형 hitbox와 landmark 근접 거리 기반이며, 정교한 애니메이션 리깅이나 IK는 아직 없다.
- 모바일 브라우저 대응과 저장 기능, 멀티플레이는 범위 밖이다.
- production build는 통과하지만, 현재 번들에 `@mediapipe/tasks-vision`과 Three.js가 함께 포함돼 번들 크기 경고가 계속 남아 있다.
- 웹캠 오버레이는 raw/cover/mirror 값을 같은 화면에서 계측할 수 있고, 현재 렌더링 기준은 `full post-mirror`다. 다음 세션에서는 실제 카메라 환경에서 boxer_ai GRU 출력이 straight뿐 아니라 hook/uppercut에서도 충분히 반응하는지 체감 튜닝이 필요하다. 번들 크기는 체크포인트 JSON과 로컬 MediaPipe task 모델이 포함되면서 더 커졌고, 현재 production build chunk 경고가 계속 남아 있다.
