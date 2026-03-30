import "./style.css";
import { ShadowboxingGame } from "./game/shadowboxingGame";

const root = document.querySelector<HTMLElement>("#app");

if (!root) {
  throw new Error("Root container was not found.");
}

const game = new ShadowboxingGame(root);
void game.start();

window.addEventListener("beforeunload", () => {
  game.dispose();
});
