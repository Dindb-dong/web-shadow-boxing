# Repository Guidelines

## Project Structure & Module Organization
This project is a browser-based shadowboxing client built with Vite, TypeScript, and Three.js.

- `src/` contains domain modules: `game` (combat rules/state), `render` (Three.js scene/animation), `pose` (tracking + features), `model` (predictor adapters), `ui` (HUD/shell), `pages` (test pages), `types` (shared types), and `utils` (pure helpers).
- `tests/` mirrors `src/` (`tests/game`, `tests/pose`, `tests/model`, `tests/ui`).
- `public/assets/` static assets (e.g., GLB avatar).
- Root HTML entry points (`index.html`, `combat-test-hub.html`, `counter-*.html`) support runtime and motion test scenarios.

## Build, Test, and Development Commands
Use Docker-first workflows.

- `docker compose up app`: run local dev server (`vite`) on port `5173`.
- `docker compose run --rm test`: run the full Vitest suite.
- `docker compose run --rm app npm run test:run`: one-off non-watch tests.
- `docker compose run --rm app npm run build`: type-check (`tsc -b`) and production build.
- `docker compose down`: stop containers.

## Coding Style & Naming Conventions
- Language: TypeScript (ES modules), 2-space indentation, semicolons, concise functions.
- File names use lower camel case (e.g., `combatSystem.ts`, `sceneManager.ts`).
- Types/interfaces/classes use `PascalCase`; variables/functions use `camelCase`; constants use `UPPER_SNAKE_CASE`.
- Prefer explicit types at module boundaries and keep modules domain-focused.
- Add short JSDoc comments for non-trivial functions and public methods.

## Testing Guidelines
- Framework: Vitest (`*.test.ts`) with jsdom for UI-focused tests.
- Mirror source paths when adding tests (e.g., `src/game/foo.ts` -> `tests/game/foo.test.ts`).
- Cover happy path, edge cases, and regressions for each behavior change.
- Before PR: run `docker compose run --rm test` and `docker compose run --rm app npm run build`.

## Commit & Pull Request Guidelines
- Follow Conventional Commit style used in history: `feat:`, `fix:`, `chore:`.
- Keep commits scoped to one change set; message should explain user-facing impact.
- PRs should include a concise summary, affected modules/paths, and test/build commands executed.
- Include screenshots or short clips for UI/animation changes.

## Versioning Rule
- Use `1.A.B` format.
- For large changes, increment `A` by 1 and reset `B` to `0` (example: `1.3.4` -> `1.4.0`).
- For small changes, increment `B` by 1 (example: `1.3.4` -> `1.3.5`).

## Project Status & Documentation
- Read `PROJECT_CURRENT_STATUS.md` before starting work.
- After each implemented change, update `PROJECT_CURRENT_STATUS.md` with current behavior and operational impact.
