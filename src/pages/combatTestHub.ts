import "../style.css";

const root = document.querySelector<HTMLElement>("#app");

if (!root) {
  throw new Error("Root container was not found.");
}

root.innerHTML = `
  <div class="test-page">
    <div class="test-card">
      <p class="eyebrow">Combat Motion Test Hub</p>
      <h1>AI 테스트 페이지</h1>
      <p class="test-description">아래 경로들은 웹캠 없이도 AI 회피와 반격 모션을 빠르게 재생해 볼 수 있는 정적 테스트 페이지입니다.</p>
      <div class="test-link-list">
        <a class="test-link-card" href="/counter-sequence-test.html">
          <strong>회피 후 얼굴 반격</strong>
          <span>AI가 dodge 후 저장된 얼굴 좌표를 향해 반격합니다.</span>
        </a>
        <a class="test-link-card" href="/counter-blocked-test.html">
          <strong>반격 블록 테스트</strong>
          <span>AI 반격이 guarded 결과로 재생됩니다.</span>
        </a>
        <a class="test-link-card" href="/counter-sway-test.html">
          <strong>반격 스웨이 테스트</strong>
          <span>AI 반격이 뒤로 빠진 defended 결과로 재생됩니다.</span>
        </a>
        <a class="test-link-card" href="/">
          <strong>메인 게임으로 돌아가기</strong>
          <span>실제 포즈 입력이 들어가는 기본 게임 화면입니다.</span>
        </a>
      </div>
    </div>
  </div>
`;
