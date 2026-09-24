# مدرستي (Madrasati) — notes for Claude

School attendance / behavior web app for مجمع زايد التعليمي - الخوانيج. React 19 + Vite + Tailwind 3 + Supabase, deployed on Vercel (`main` auto-deploys). The owner (Yunis) is non-technical and speaks Egyptian Arabic: explain in plain Egyptian Arabic, one step at a time, and ask before decisions.

Full detail: `PROJECT_DOCUMENTATION.md`. The old "madrasati-school-system" skill describes an obsolete PyQt desktop app — ignore it.

## Workflow
- Repo `C:\Users\ENG.YUNIS\madrasati`. Commit locally with git (`"C:\Program Files\Git\cmd\git.exe"`, `GIT_TERMINAL_PROMPT=0`); the user pushes with GitHub Desktop ("Push origin"). Check with `git fetch -q origin; git status -sb`.
- No local build (npm blocks the xlsx tarball; do not change npm config). Check with `npx --yes oxlint <files>`; for import/syntax errors bundle with esbuild (`--outfile` to a temp file, NOT `nul` — it creates `nul.css`).
- Files are CRLF: use the Edit tool, not PowerShell string replace.
- Database changes: give the user SQL to run in the Supabase SQL Editor, explain it first, and never ask for service_role/API keys. Code must tolerate a missing column/table where possible (`select('*')`, best-effort inserts).
- Never run `python` with a heredoc (it hangs waiting for stdin).

## Architecture
- `src/lib/AppContext.jsx` — lang/dark/session/staff (`t` = i18n dict). `staffLoading` only shows on first load per user (background auth refresh must not remount pages).
- `src/lib/i18n.js` — every UI string, `ar` and `en` blocks must stay in sync (no hardcoded Arabic in JSX except inside `lang === 'ar' ? … : …`).
- `src/lib/Dialogs.jsx` — `useDialogs()` → `confirm()` (async) and `notify(msg, type)`; use these, not `window.confirm/alert`. (`confirmLeave` in AppContext stays native — it is synchronous.)
- `src/lib/sections.js` (grade/stream/section labels, `gradeLabel` auto-translates grades), `search.js` (`searchStudents`, first-name matches rank first), `staffInfo.js` (cycles/subjects), `fetchAll.js` (1000-row paging), `attendanceDerive.js`, `whatsapp.js`.
- Pages in `src/pages`, shared UI in `src/components` (Sidebar with groups + phone "More" menu, Header, SectionPicker, ContactParentPanel, BulkContactModal, EmptyState, SectionChecklistModal, ChipMultiSelect).
- Routes/role guards: `src/App.jsx`.

## Rules that matter
- Roles: admin, edari (إداري), supervisor (مشرف), recorder (معلم). Edari: everything except attendance delete, reset attendance, staff management/assignments, contact-request approval. Supervisor/admin approve teacher violation reports and parent-contact requests. Teachers/supervisors are scoped to `staff_sections`.
- Supabase returns max 1000 rows: page with `fetchAllRows` (+ unique `.order('id')`) and chunk long `.in()` lists (`fetchAllRowsByIds`).
- Attendance: 8 periods/day; absent if ≥3 absent periods; present only if all 8 recorded; else undecided.
- Pages keep `min-h-screen`, `max-w-5xl` (lists/forms) / `6xl` (reports) / `7xl` (dashboards) containers, cards via `cardFloating(dark)`. Dark-mode text uses slate-200/300, never slate-400.
- Dates: use `ar-u-nu-latn` (Arabic words, Latin digits) everywhere.
