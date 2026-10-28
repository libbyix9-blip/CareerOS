# Startup repair and sync-on-open

The user reported that the initial loading screen persisted. At investigation time there was no visible listener on port 3000, and this task session could not create one (`listen EPERM`). Browser JavaScript console/transport inspection was unavailable, so a completed live-browser fix is not asserted.

Implemented:

- `npm start` uses the direct local Node server without a Next.js build/hydration dependency; the framework entrypoint remains `npm run start:next`.
- The Finder shortcut / `npm run open` starts a detached background supervisor, records startup diagnostics in ignored private `data/desktop.log`, waits for health, and permits its Terminal window to close after readiness.
- Startup tests execute the actual client modules in a synthetic DOM, verifying sign-in and dashboard rendering plus the authenticated sync-on-open request.
- Opening requests bounded/coalesced job discovery and, when configured/connected, Gmail sync. Gmail setup, read-only OAuth, encrypted token handling, backfill, conservative extraction, grouping, manual-status protection, evidence, and review workflows are documented in `GMAIL.md`.

Storage repeatedly reached ENOSPC during the work. Only generated CareerOS build cache and the npm download cache created by its dependency installation were cleared; installed modules, source, database, backups, and personal documents were preserved. Continued low disk space can still prevent database writes or startup and is not solved by refreshing the browser.

Validation: syntax checks, actual-client startup execution tests, conservative Gmail classification/OAuth/grouping tests and TypeScript checks are run locally. Real Gmail calls need the owner's OAuth client configuration and browser consent. The sandbox's listener restriction means the final launch must run in the normal Mac session; inspect the health confirmation and startup log before claiming success.
