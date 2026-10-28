# CareerOS

## [Open your permanent CareerOS home page →](https://github.com/libbyix9-blip/CareerOS/blob/main/HOME.md)

Bookmark that private GitHub page. It remains available while the local application is closed and links directly to your workspace when it is running.

A private career discovery and application tracking workspace. This is a **local Phase 1 MVP**, with real SQLite persistence and a Next.js shell. It is not yet a production-hosted career agent. Gmail, external AI reasoning, and PostgreSQL-backed hosting are not operational. Private multi-résumé uploads and a reusable cover-letter library are implemented.

## Open the application

Node.js 24+ is required. In your normal Mac Terminal:

```sh
cd /Users/libbyix/careeros
npm run launch
```

The launcher installs dependencies using the committed manifest/lockfile, runs `npm audit --audit-level=high`, initializes the database, runs syntax checks/tests/TypeScript checks, builds Next.js, and starts CareerOS. It opens the default browser **only after the server is listening**. It stops if a step fails and never runs `npm audit fix --force`.

Create your owner account in the browser. Use a password of at least 14 characters. Your email is just your local account identifier; no email is sent and no Gmail access is requested. First-run setup is allowed only on the loopback interface and requires a matching request origin and Host header.

After setup, keep Terminal running while using the app. Press Control-C to stop. The database survives process restarts. The default URL is **http://127.0.0.1:3000**; use this exact address, rather than `localhost`, because Host and origin are checked.

For subsequent starts, when dependencies and the build are already current:

```sh
npm start
```

For development: `npm run dev`. A no-framework fallback is available with `npm run local`; it uses the same API, UI assets, database, and tests. It is useful for diagnosis and does not replace the default Next.js entrypoint.

## What is implemented

- Owner setup and sign-in, salted scrypt password hashes, database-backed throttling, hashed random sessions, HttpOnly/SameSite cookies, sign-out, expiry, same-origin mutation protection, and strict Host checks.
- Durable SQLite database, ordered SQL migration, foreign-key constraints, user-scoped application/state queries, private file permissions, integrity check, and online backup command.
- Public Greenhouse, Lever, and Ashby adapters. Normalization includes structured annual salaries where available, original URLs, source attribution, posting dates only when published, descriptions, qualifications when structured, discovery time, and last observed availability.
- Deduplication across normalized company/title/location plus stable source IDs. Every source posting URL is retained. Different locations remain separate. Conservative limitations are documented in `docs/ARCHITECTURE.md`.
- Bounded requests, pagination, response-size limits, retries, refresh lock, transactional ingestion, source history, manual refresh, scheduled refresh while the server runs, and visible source failures. Failed feeds never close previously ingested jobs.
- Provisional matching with configurable 35/25/15/10/10/5 weights. Three feeds and a 60/25/15 recommendation blend when inventory permits. Scores explain known preferences and unknown qualifications. Unknown/non-USD compensation is neutral; no fabricated résumé or eligibility evidence.
- Search, sort, company/location/source/score/date/arrangement/salary filters, save/unsave, dismissal/restoration, applied tracking, feedback, and separate Saved/Wildcard views.
- Manual applications with exactly nine statuses, notes, contact, source, dates, latest update, original URL, edit/delete, CSV export, no-response aging, pipeline counts, response rate, eight-week application chart, and activity.
- Editable preferences and self-reported skills, recalculation, dark/light modes, responsive layouts, native accessible dialog behavior, keyboard focus, loading/empty/error states, and reduced-motion support.
- Personal JSON export and account deletion. Existing backups are independent copies and must be deleted separately.

## What remains unconfigured or deferred

| Capability | Current state / next step |
|---|---|
| Live source refresh in this task environment | Shell DNS is restricted. The adapters are implemented and fixture-tested; this restricted session cannot independently verify live imports. Run the app in your normal Terminal; account setup triggers a first refresh, and manual Refresh is available. Verify source results in Settings. |
| Gmail | Phase 2: not implemented. No OAuth tokens or messages are accessed or stored. Implement consent, read-only OAuth, encrypted token storage, resumable six-month backfill, grouping, confidence/review, manual merge/split and revocation before enabling. |
| Résumé files | Implemented locally: multiple PDF/DOCX/TXT uploads; macOS PDFKit text extraction; bounded DOCX parsing; private database BLOB storage; reviewable text and skills; one selected reviewed résumé drives matching. No OCR or automated credential verification. |
| Generative AI | Not configured or called. The current score and explanations use deterministic, tested preference rules. This is deliberately labeled in the product. |
| PostgreSQL / Prisma runtime | The original schema and migration are preserved under `prisma/` and have been validated/generated. **The running app uses native SQLite SQL**, not Prisma. A PostgreSQL repository adapter, local data migration, and integration tests are required before switching. No PostgreSQL server was available on this machine. |
| GitHub | Private source repository: https://github.com/libbyix9-blip/CareerOS. Source is uploaded through the connected GitHub tools; local Git still requires Xcode Command Line Tools. Personal files and database records are excluded. |
| Vercel | No deployment created. This app currently requires a long-running Node process and writable persistent disk. Do not deploy its SQLite file to ephemeral Vercel storage. Complete PostgreSQL and background-job adapters first. `docs/vercel.reference.json` is an archived plan, not active deployment configuration. |
| Browser/mobile QA | Layouts and behavior implemented; a running browser session is still required for visual and end-to-end verification. |

## Commands

```sh
npm run db:init       # apply SQLite migrations and check integrity
npm run check         # syntax checks
npm test              # scoring, source, persistence, ownership, auth and request-handler tests
npm run typecheck     # Next.js TypeScript shell
npm run build         # production Next.js build
npm run db:backup     # consistent online backup into ignored backups/
npm run setup         # CLI owner creation, for a server without local browser onboarding
npm run db:validate   # validate preserved PostgreSQL Prisma schema; needs DATABASE_URL
npm run db:generate   # generate the preserved Prisma client, not needed by SQLite runtime
```

## Configuration

No `.env` is required for default localhost operation. Copy `.env.example` if changing settings.

| Variable | Purpose |
|---|---|
| `HOST` | Default `127.0.0.1`. Do not expose to a network without hardening. |
| `PORT` | Default `3000`. |
| `APP_URL` | Exact browser origin, including scheme, host and port. Default derives from HOST/PORT. |
| `DATABASE_PATH` | Default `./data/careeros.sqlite`. Use persistent private storage. |
| `REFRESH_HOURS` | Default `12`. Set `0` to disable the timer. The process must remain running. |
| `CRON_SECRET` | Optional random Bearer credential for `POST /api/cron`. Generate with `openssl rand -hex 32`. Keep server-side. |
| `SECURE_COOKIES` | Default false for localhost HTTP. Set true only with HTTPS APP_URL and a reverse proxy. |
| `DATABASE_URL` | Used only by the preserved Prisma/PostgreSQL tools, not the local app. |

If binding beyond localhost, the launcher requires an existing owner, HTTPS APP_URL, and secure cookies. This is a minimum guard, not a claim of production security review. Finish hosted authentication, deployment testing, monitoring, and database migration before exposing the app publicly.

## Dependency security

The original installation reported three high findings originating from `deepmerge-ts@7.1.5` through `prisma -> @prisma/config`. The underlying advisory is [GHSA-ggr8-5vv4-36mx](https://github.com/advisories/GHSA-ggr8-5vv4-36mx): stack exhaustion for recursive object graphs, fixed in 8.0.0+. `package.json` applies a targeted `deepmerge-ts: ^8.0.1` override. **Until `npm install` completes in the working Terminal, the old version may remain installed.** Inspect with `npm ls deepmerge-ts`, then run `npm audit` to verify the complete current result. No zero-vulnerability claim is made without a successful audit.

The installation log showed all three Prisma install scripts exited successfully and engine binaries/client were present. Exact-version `allowScripts` approvals were recorded for the installed `@prisma/client`, `prisma`, and `@prisma/engines`; no global or blanket approval was used. `prisma validate` and `prisma generate` passed. Review approvals again if changing their versions.

See `docs/VERIFICATION.md` for observed results and limitations.

## Résumés, posting links, and cover letters

Open **Profile & Résumé** to upload several PDF, DOCX, or TXT versions (up to 5 MB each). Review the extracted text and suggested skills, correct any errors, and check **Use this reviewed résumé as the foundation for matching**. Only the selected reviewed version affects résumé evidence; other versions remain available. Cover-letter claims never supply résumé qualifications. Role and skill components use grounded text overlap; scores remain provisional and do not establish eligibility or verify years, credentials, or clearances. Clear the matching checkbox or delete the active version to return to preference matching.

PDF extraction uses macOS PDFKit locally with bounded subprocess time/output. Other operating systems can still use DOCX/TXT/paste. Scanned and locked PDFs require readable text to be pasted; no OCR is claimed. DOCX parsing reads only the main Word text part, without extracting archive paths or loading external entities; review headers, footers, formatting, and any missing sections manually. Files and full original text are stored in the private SQLite database and included in database backups. Files are downloaded only via session-protected attachment endpoints. Exports contain reviewed and original text, and original binaries can be downloaded individually. No third-party AI receives these documents.

Open **Cover Letters** for suggested career buckets, search, editable bucket names, company/role context, preserved originals, text export and working copies. From a discovered job, **Tailor a copy** chooses a related letter by career-theme overlap and creates a job-linked draft with the original wording preserved for your edits. It does not generate new experience claims or submit anything. Duplicate originals with the same normalized text are skipped.

Every discovery card now has a direct **Original posting** link and a separate **Search LinkedIn** convenience link. The latter searches the employer and title; it is not represented as a verified LinkedIn posting. Job details retain all known original source links.

A restart is required after updating server code: stop the existing process with Control-C, then run `npm run build && npm start` from the project directory. Your account, applications, saved jobs and imported documents remain in the same database.

## Simple local refresh

Double-click **Start CareerOS.command** in the project folder. It recognizes this checkout's existing listener, gracefully replaces that CareerOS process, starts the current app without a package download/build, and opens your browser once ready. It refuses to stop an unrelated process. Keep its Terminal window running. Server-module edits trigger a restart automatically; client files are read fresh on a normal browser reload. If the managed app is already running, the shortcut simply reopens it.

UI routes now serve the independent HTML/module entrypoint. Next.js build/hydration chunks are no longer required for the local UI to start, preventing an older production process from hanging after its build files have been replaced. The boot module provides a visible retry/restart message for module failure or excessive startup time, and API calls time out rather than waiting indefinitely. The Next.js shell/build remain available, but the default UI transport intentionally owns its DOM independently.

The current execution session cannot open localhost listeners. Run the shortcut from Finder on your Mac. It does not grant this session additional permissions or alter its restrictions.

## GitHub and hosting

A private GitHub repository can store the source and run `.github/workflows/checks.yml`. Source is stored in the private [CareerOS repository](https://github.com/libbyix9-blip/CareerOS). Completed changes use focused commits with explicit validation, as recorded in `AGENTS.md`. Do not upload `data/`, `backups/`, `.env`, résumé/letter files, `node_modules/`, or `.next/`.

GitHub Pages is static hosting and cannot run this app's Node API, authentication, private document storage or SQLite database. An eventual public URL requires a server-backed host with persistent storage or the planned PostgreSQL adapter. No repository or hosted deployment is claimed until verified from the provider.

## Permanent home page

`CareerOS Home.html` is a self-contained page you can open directly from Finder, even while the application server is stopped. The same page lives at `sites/careeros-home/dist/index.html` and has a narrowly scoped GitHub Pages publication workflow. Only this generic page is eligible for the Pages artifact: no database, uploaded documents, private exports, or app secrets are included.

The page links to the existing workspace at `http://127.0.0.1:3000`. These links reach the app on the computer opening them. They do not provide remote access to your Mac, and the app still needs to be running. Hosting the complete workspace remains a separate backend deployment.

A private Sites project was registered for this home page, but its source-publishing helper is blocked by missing local Git/Xcode Command Line Tools. Its generated origin is not a verified deployment URL. The GitHub Pages workflow attempts the user's previously requested hosting path; GitHub account capabilities and repository Pages permissions determine whether publication is available. Check the completed deployment output before treating a web address as live.

The private rendered `HOME.md` page is the immediate, verified-access route and does not require GitHub Pages. The attempted Pages publication was rejected at site creation with “Resource not accessible by integration.” Its workflow is now manual-only until an owner enables Pages in repository settings. No GitHub Pages URL or Sites deployment is represented as live.
