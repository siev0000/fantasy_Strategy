Original prompt: 全体を整理してほしい。メモと地形ランダム生成だけは消さないで vueファイルにできるところはVueファイルに

- 2026-02-26: Started reorganization with focus on preserving map random generation and memo docs.
- 2026-02-26: Confirmed current map generation exists in `web/js/map.js` and is currently bridged from `app-vue.js` via direct DOM listeners.
- 2026-02-26: Added Vue component files `app-header.js`, `map-generator-panel.js`, and `menu-panel.js` to move UI blocks out of `index.html`.
- 2026-02-26: Updated `index.html` to use Vue components and removed large inline section markup.
- 2026-02-26: Simplified `app-vue.js` by removing manual map bridge wiring; map lifecycle now lives in `MapGeneratorPanel`.
- 2026-02-26: Added `render_game_to_text` and `advanceTime(ms)` hooks in `app-vue.js` for automated testing compatibility.
- 2026-02-26: Validation: `node --check` passed for modified JS files, server health/index checks passed.
- 2026-02-26: Playwright client run failed because `playwright` package is not installed in this environment.
- 2026-02-26: Began SFC migration under `frontend/` after user requested true `.vue` conversion.
- 2026-02-26: Added Vite config (`frontend/vite.config.mjs`) and Vue entry files (`frontend/index.html`, `frontend/src/main.js`).
- 2026-02-26: Converted UI into SFC components (`AppHeader.vue`, `MapGeneratorPanel.vue`, `MenuPanel.vue`, modal components).
- 2026-02-26: Ported battle/simulator/socket logic into `frontend/src/App.vue`.
- 2026-02-26: Ported map generation to ESM modules (`frontend/src/lib/map-generator.js`, `frontend/src/lib/realistic-island.js`) while preserving behavior.
- 2026-02-26: Added npm scripts for frontend (`dev:front`, `build:front`, `preview:front`) and Vite dependencies.
- 2026-02-26: Added `dev:all` script to launch backend and frontend together from one command.
- 2026-02-26: Validation passed: `npm run build:front`, server health check, and Vite dev page response.
- 2026-02-26: Verified `npm run dev:all` reaches both `http://localhost:3000/health` and `http://localhost:5173`.
- 2026-02-26: `develop-web-game` Playwright client retry still failed because skill-local `playwright` package is unresolved.

TODO / next agent:
- Decide rollout strategy: serve `web-vue-dist` from Express or keep Vite dev only.
- Decide whether to deprecate legacy static frontend files under `web/js` after user confirmation.
