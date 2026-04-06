# 프로젝트 개요

## 주제

### 제목: 컴퓨터 속 쉐도우복싱 파트너

## 핵심 목표

1. 카메라를 통해 실시간으로 상대의 움직임을 파악해
2. 미래 상대의 주먹 궤도를 예측하고
3. 예측을 바탕으로 주먹을 성공적으로 피하는 복싱 AI를 제작

## 핵심 아이디어

<aside>

mediapipe를 통한 최근 상대의 이동 경로 산출 → GRU를 통한 미래 상대의 주먹 경로 예측

</aside>

1. 카메라를 통해 실시간으로 초당 20 프레임의 사진을 확보
2. mediapipe를 통해 왼팔, 오른팔의 좌표 계산
3. 좌표들로부터 유의미한 정보들을 만듦
4. 가장 최근 12개의 정보들을 GRU에 넣고 미래 6프레임의 주먹 위치를 예측
5. 예측값을 바탕으로 주먹 회피

# 프로젝트 상세

## 아키텍쳐 개요

![궤도 예측 파이프라인(추론 시)](attachment:56f33fd4-d4e6-43db-9f20-7f5b5fc69f2f:SmartSelect_20260323_221641_Samsung_Notes.jpg)

궤도 예측 파이프라인(추론 시)

구체적으로는

1. 실시간으로 카메라에서는 20FPS로 프레임 이미지를 얻는다.
2. 각 프레임 이미지 마다 media pipe를 통해 왼팔/오른팔 관련 정보들을 추출한다.
3. 가장 최근 12 step의 정보들을 GRU(또는 LSTM)에 입력으로 넣는다.
4. GRU의 마지막 hidden state를 2가지 MLP Head에 각각 넣어 최종 output을 얻는다.
    1. MLP Head1 — state 예측 : idle / attacking
    2. MLP Head2 — 미래 6 step의 궤도를 예측

## 아키텍쳐 상세

각 과정의 상세한 변수들, 그리고 그 변수들의 차원을 보자.

### MediaPipe 출력 → GRU 입력(그림의 info)

media pipe의 출력 중 다음 값들을 사용한다.

$$ \mathcal{K}_\text{pose}=\{L_s,L_e,L_w,R_s,R_e,R_w\}$$

여기서 $L_s,L_e,L_w$ 는 각각 왼쪽 팔의 어깨, 팔꿈치, 주먹의 $(x,y,z)$ 좌표다.
$R_*$ 도 마찬가지.

좌표를 그대로 쓰면 안되고(영상마다 절대 좌표는 값이 다를 수 있으니) normalization을 해야하는데 관련 로직은 여기 적어둔다.

- 좌표 normalization
    
    몸을 기준으로 원점을 잡자.
    정확히는 양 어깨를 기준으로 하자.
    
    $$
    c_t = \frac{L_s (t)+ R_s (t)}{2}
    $$
    
    그리고 스케일은 양 어깨 사이 거리를 기준으로 하자.
    
    $$
    s_t =\|L_s(t)-R_s(t)\|_2 +\epsilon
    $$
    
    여기서 epsilon은 아주 작은 값이다. 나중에 $s_t$로 좌표를 나누니까 $s_t$가 0이 되는 것을 방지하기 위함.
    따라서 각 점의 좌표를 이렇게 변환한다.
    
    $$
    \tilde{p}_t = \frac{p_t - c_t}{s_t}
    $$
    

이 값들을 통해 아래와 같이 GRU의 입력을 만든다.
이걸 좀 뜯어보자면

$$
\text{GRU Input}=
\begin{pmatrix}
\text{info}_1 \\
\text{info}_2 \\
\vdots \\
\text{info}_{12}
\end{pmatrix} =
\begin{pmatrix}
(f_{L,s}^{(1)},f_{L,e}^{(1)},f_{L,w}^{(1)},f_{R,s}^{(1)},f_{R,e}^{(1)},f_{R,w}^{(1)}) \\
(f_{L,s}^{(2)},f_{L,e}^{(2)},f_{L,w}^{(2)},f_{R,s}^{(2)},f_{R,e}^{(2)},f_{R,w}^{(2)}) \\
\vdots \\
(f_{L,s}^{(12)},f_{L,e}^{(12)},f_{L,w}^{(12)},f_{R,s}^{(12)},f_{R,e}^{(12)},f_{R,w}^{(12)})
\end{pmatrix}
$$

그리고 여기서 $f$는 이렇다

$$
f^{(t)}=(p^{(t)},v^{(t)},a^{(t)})
$$

이걸 좀 뜯어보자면

- $f_{L,s}^{(t)},f_{L,e}^{(t)},f_{L,w}^{(t)},f_{R,s}^{(t)},f_{R,e}^{(t)},f_{R,w}^{(t)}$ 
각 점들(왼쪽/오른쪽 팔의 어깨, 팔꿈치, 주먹 좌표)에 대한 정보를 입력으로 쓰겠다는 뜻.
- $f^{(t)}=(p^{(t)},v^{(t)},a^{(t)})$
각 점에 대해 위치 $p$, 순간 속도 $v$, 순간 가속도 $a$를 쓰겠다는 뜻.
- $v^{(t)},a^{(t)}$는 이렇게 계산
$v^{(t)}=p^{(t)}-p^{(t-1)}$ / $a^{(t)}=v^{(t)}-v^{(t-1)}$
시퀀스 앞부분($t=1,t=2)$에서는 zero padding으로 하자.

따라서 GRU의 입력 shape은

$$
(12,\,54)
$$

왜냐하면

- $f^{(t)}=(p^{(t)},v^{(t)},a^{(t)})$에서 $p \in \mathbb{R}^3,v \in \mathbb{R}^3,a \in \mathbb{R}^3$이라서 점 당 9차원이고
- 총 6점($f$ 개수)이니까 한 프레임(info)의 입력 차원은 $6 \times 9=54$
- 총 12프레임 이므로 $(12,54)$

### GRU 출력 → MLP Head 입력

GRU의 마지막 hidden state vector를 사용한다.

$$
\text{MLP Head Input}=h_t
$$

### MLP Head 출력(최종 출력)

MLP head1는 상대의 action state를 예측한다.

$$
\hat{y}^\text{state}_t=\text{MLP Head}_1(h_t) \in \{\text{idle}, \,\, \text{attacking}\}
$$

MLP head2는 상대의 왼쪽/오른쪽 주먹의 미래 경로를 예측한다.

$$
\hat{y}_t^\text{traj}= \text{MLP Head}_2(h_t)=[(\hat{L}_w(t+1),(\hat{R}_w(t+1)),\ldots,(\hat{L}_w(t+6),(\hat{R}_w(t+6))]
$$

여기서 $\hat{L}_w(t+1)$은 왼쪽 주먹의 $t+1$ step에서의 좌표를 예측한 값이다.
수식에서도 알 수 있듯 총 6 step의 미래를 예측한다.
시간으로 따지면 0.05 * 6 → 0.3초 뒤의 미래까지 예측하는 것.

이 head의 차원은

$$
(2,6,3)
$$

flatten 시에는 36. 왜 저렇게 나오냐면,

- $2$ : 양손목에 대해, $6$ : 6개의 미래 step을, $3$ : $x,y,z$의 3차원 좌표로 예측

# 학습 및 데이터셋 제작

파이프라인은 별다른 것은 없고 media pipe 부분은 제외하고 GRU 부분만 학습한다.
즉, 미리 학습에 쓰는 이미지를 media pipe를 통과시켜 놓은 데이터가 필요하다.

## 학습 데이터 제작

영상 하나가 있다고 치자. 그러면

1. 영상을 우선 20FPS — 즉 0.05초 마다 캡쳐를 해서 학습에 쓸 이미지들을 만든다.
2. media pipe를 통과시켜 왼쪽/오른쪽 팔의 어깨, 팔꿈치, 주먹의 좌표를 얻는다.
3. 위의 추론 과정에 적어둔 “MediaPipe 출력 → GRU 입력” 과정을 진행해 GRU 입력을 만든다.
4. 모든 입력 값($\text{info}$)에 대해 state(idle/attacking)를 라벨링 한다.

이러면 준비 끝.
GPT에게 물어본 결과 데이터셋은

- 약 1시간 분량의 비디오

면 충분하다고 한다.

또 라벨링의 경우, 사람이 1시간 분량의 비디오에서 초당 20프레임을 전부 annotation하기는 매우 곤란하기에, 휴리스틱 기반으로(손목의 위치, 속도 기반 판정 등) 1차적으로 판정 후 사람이 검증하는 식으로 해야한다.

## 학습 Loss

먼저 state loss부터.
binary classification이니까 cross entropy를 쓰자.

$$
\mathcal{L}_\text{state}=\operatorname{CE}(y^\text{state},\hat{y}^\text{state})
$$

다음으로 trajectory는 regression loss(**확정 아님, 만약 가우시안을 쓰면 달라질 수 있음**)

$$
\mathcal{L}_{\text{traj}} = \frac{1}{12} \sum_{h=1}^{6} \left( \| \hat{L}_w(t+h) - L_w(t+h) \|_2^2 + \| \hat{R}_w(t+h) - R_w(t+h) \|_2^2 \right)
$$

<aside>

**주의 —  state 비율 차이에 따른 조치 필요**
학습 데이터에 state가 idle인 구간이 attacking인 구간보다 훨씬 많거나 적을 수 있다.
이거 고려해서 loss에 가중치를 주거나 학습 때 사용되는 비율을 맞춰줄 필요가 있다.

예를 들면 (attacking이 idle보다 적은 경우)

$$
\mathcal{L}_\text{traj} \leftarrow  w_t\mathcal{L}_\text{traj} \quad \text{where} \quad w_t = \begin{cases}
\alpha(>1) & \text{if attacking}  \\
1 & \text{if idle}
\end{cases}
$$

</aside>

따라서 전체 loss는 이렇게 구성하자.

$$
\mathcal{L} = \lambda_\text{state} \mathcal{L}_\text{state} + \lambda_\text{traj}\mathcal{L}_\text{traj}
$$

---

이건 나랑 GPT랑 얘기하면서 했던 GPT의 답변

https://chatgpt.com/s/t_69c14f284dd8819181654860ac53e0aa

# 회피 동작 구현 및 사용자 인터렉션

## 회피 동작 구현

위의 아키텍쳐의 최종 output은 다음과 같다.

- 현재 state — attacking / idle
- 미래 주먹 궤도 — $(x_1,y_1,z_1),(x_2,y_2,z_2), \ldots ,(x_6,y_6,z_6)$
- 현재 양 어깨 사이의 거리 및 양 어깨의 중심
    - model에 입력으로 넣을 때 이걸 기준으로 normalization을 했으므로 denormalization을 해서 위치 정보를 복원하자

위와 같이 얻어진 값들을 바탕으로 주먹을 회피하면 된다.
회피 로직은 휴리스틱 기반으로 생각 중.

- idle — 느린 속도로 예상 궤도의 반대로 이동(좌우로의 이동 정도만?)
- attacking — 빠른 속도로 예상 궤도의 반대로 이동(상하, 좌우 및 대각선 이동 모두 고려)

## 사용자 인터렉션

실제로 쉐도우 복싱을 하고 있다는 것을 사용자에게 충분히 보여주려면 다음이 필요하다.

- 화면에 회피 동작을 수행하는 AI의 몸체가 보일 것
- 상대의 주먹 경로를 예상한 것을 오버레이 할 것
- (선택사항) 사용자의 모습을 사이드에 배치해서 잘 인식하고 있음을 보일 것

따라서, 이를 위한 3D 가상환경이 필요하다.
우리는 Three.js를 택했다.