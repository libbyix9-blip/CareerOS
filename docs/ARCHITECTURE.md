# Architecture and boundaries

## Local runtime

`src/app/` is the Next.js App Router / TypeScript shell. `public/app.mjs` mounts the interactive application after hydration; it renders escaped templates, uses native dialogs, and calls same-origin JSON endpoints. Its styling uses local CSS and system fonts, with no external asset fetches. Tailwind and Radix are installed for future React component migration; they are not required by the current UI. The shell does not pre-render personal data.

`scripts/next-server.mjs` starts the custom Next.js server and the API on one loopback port. `server.mjs` owns transport, safe static-file allowlists, request-size limits, Host/origin checks, authenticated routes, and privacy-safe error references. Next.js internal asset routes delegate to the Next handler. A per-response CSP nonce is passed to Next for hydration scripts.

`lib/store.mjs` owns SQLite access and runs the tracked `migrations/` in a transaction. Queries use bound parameters, ownership filters, foreign keys, and uniqueness constraints. WAL and busy timeouts support the local background ingestion workload. Source ingestion commits the complete validated snapshot atomically; an error rolls back the batch. File permissions restrict the database; encryption at rest relies on the operating system/volume and is not supplied by SQLite. Consider FileVault for sensitive local records.

`lib/sources.mjs` implements public ATS retrieval, source schema normalization, stable posting IDs, salary interpretation, and safe posting URLs. `lib/discovery.mjs` orchestrates retries, bounded concurrency, persisted locks, and per-source run history. Default employer board identifiers may change and need live verification. Add another permitted public board to the SOURCES configuration to extend discovery. The app never invokes an application submission API.

`lib/matching.mjs` handles scoring and blending. Title/description concepts are a baseline, with explicit preference evidence and bounded similarity feedback. Unknown skills and salary contribute 50 to their components. The weighted total is displayed with component details. Self-reported skills influence their component but do not prove depth, years, credentials or eligibility. Free-text constraints are stored as context, not silently enforced. Remote does not establish work authorization or location eligibility. There is no external LLM or embedding model in this MVP.

`lib/domain.mjs` validates inputs, enforces the exact status set, derives No Response after 30 days without a recorded response, and escapes CSV formulas. Notes alone do not create a recruiting response. A manually entered response status can record today's response date if omitted, and is editable. Manual updates are the only application evidence in this phase; Gmail is visibly disabled.

## Records and deduplication

`jobs` is the canonical public posting. `job_postings` retains each source's identifier, URL, availability and verification time. Normalized company/title/location fingerprints remove punctuation/case differences while preserving letters in non-English titles. Known source IDs keep stable canonical job identities after minor posting edits. Fingerprints are heuristic: two genuine requisitions with identical company/title/location may consolidate, and substantially different location formatting may remain separate. Exact and cross-source duplicate behavior is covered by tests; semantic deduplication and a review UI are future work.

`job_states` is per-user save/dismiss/feedback state. Applications are private and can be created independently from discovery. A user+job uniqueness constraint prevents repeated applied marking. Manual roles with the same employer stay separate records; no company-only grouping is used. Gmail merge/split evidence semantics remain Phase 2.

`source_runs` contains only public source keys, times, counts and sanitized error codes. Public postings and source logs are retained after private account deletion. `activity` stores recent private changes. Sessions store only token hashes, expire in seven days, and are revoked on logout. Owner login attempts are throttled in the database. Passwords use a unique salt and scrypt; plaintext passwords are never persisted or logged.

## Scheduling

On local startup with an existing owner, stale/never-refreshed sources trigger discovery. First account setup also triggers it. Thereafter the timer checks every REFRESH_HOURS. This only runs while the process is alive. For an unattended persistent Node deployment, an external scheduler can POST to `/api/cron` using the server-only Bearer secret. The endpoint starts a background run and returns promptly; this is not suitable for short-lived serverless functions. HTTP 202 or a lock acquisition is not a claim that all feeds succeeded: inspect per-source results.

## Planned hosted architecture

The preserved `prisma/schema.prisma` and PostgreSQL migration describe the original production direction. Port the Store repository to Prisma/PostgreSQL, including source-posting and activity models added in the local MVP. Add durable jobs/queues for ingestion, OAuth backfills and résumé parsing. Replace local owner bootstrap with hosted identity. Move uploads into private object storage and encrypt refresh tokens with a managed rotating key. Move long-running discovery out of the web request lifecycle. Only then enable a Vercel deployment and real cron schedule.

All new private records must be owner-scoped at their repository boundary, not just filtered in the browser. Tests should exercise both authorized and unauthorized access. Avoid storing full email bodies and do not send mail or submit applications automatically.

## Career documents (migration 002)

`career_documents` stores private résumé/cover-letter metadata, original file BLOBs, preserved original text, editable text, source attribution, review status, skill suggestions, reviewed skills, an active résumé flag, career bucket, and parent/job references for working copies. Owner foreign keys cascade on account deletion. Listing/detail queries omit file BLOBs; only authenticated attachment downloads read originals. A partial unique index permits one matching résumé per owner, and normalized-text hashes prevent duplicate originals while allowing intentional copies.

`lib/documents.mjs` implements content/type validation, 5 MB limits, local PDFKit extraction on macOS, a bounded DOCX main-text reader (no filesystem extraction or XML entities), literal skill suggestions, editable bucket suggestions, and career-theme letter recommendations. Inputs, extraction output and subprocess time are bounded; private parser diagnostics are never logged. PDFKit does not perform OCR. Neither parser infers degrees or dates. `public/library.mjs` supplies the document review, upload, bucket and working-copy interface.

Only reviewed text and explicitly approved skills from the selected résumé enter `Store.matchingProfile`. The primary résumé informs both role and skill components; user preferences continue to guide compensation, location, industry and preferred role direction. Cover-letter text is excluded from scoring evidence. All scores remain provisional, and semantic reasoning, credential verification, years-of-experience checks and external AI inference remain unimplemented. Career buckets and letter similarity use transparent phrase matching and require user judgment.
