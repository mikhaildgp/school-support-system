# Repository Guidelines

## Project Structure & Module Organization
The app runs from `index.html` and loads ES modules under `app/`. `app/main.js` boots Supabase auth, `app/state.js` stores cached data, `app/supa.js` wraps the Supabase client, and UI modules in `app/ui/` render each panel (timetable, tasks, subjects, system stats). Shared CSS lives in `assets/styles.css`. Keep new feature modules in `app/ui/feature-name.js` and wire them from `app/main.js` so the bootstrap sequence remains readable.

## Build, Test, and Development Commands
- `npx serve@latest .` — quick static server that respects ES module paths; run from the repo root during development.
- `python3 -m http.server 4173` — minimal alternative if `serve` is unavailable; update Supabase redirects if you change the port.
- `npm test` — placeholder; add a proper script when automated tests land so CI hooks stay consistent.

## Coding Style & Naming Conventions
Use modern ES modules with two-space indentation and trailing commas on multi-line literals when useful. Export named functions (e.g., `renderLayout`) from UI files and keep camelCase for helpers (`initSystem`, `loadLocalIfNeeded`). Leverage `const` by default, reserving `let` for reassignments. For CSS, scope additions inside existing utility classes or cards to avoid regressions.

## Testing Guidelines
Automated tests are not yet established, so exercise new features manually: sign in through Supabase, switch roles, add tasks/homework, and ensure localStorage sync works across tabs. When introducing tests, colocate them under `app/__tests__/` and adopt Vitest or Jest with DOM testing utilities. Name specs after the module under test (`system.spec.js`) and ensure they run headless in CI.

## Commit & Pull Request Guidelines
Follow the existing convention: start with a capitalized summary, optionally add an em dash for context (`Improve auth flow — clarify role toggles`). Commits should be scope-focused; avoid bundling unrelated UI and data changes. Open PRs with a concise summary, screenshots of UI updates, Supabase migration notes if applicable, and links to tracking issues or task IDs. Flag breaking config changes so environments can be updated.

## Security & Configuration Notes
`supabase_config.js` auto-selects sandbox vs production based on host; edit values in-place rather than hardcoding per module. Keep `supabase_config.sandbox.js` limited to local sandbox runs and never ship it in production builds. Avoid logging secret payloads, and rotate exposed anon keys promptly.
