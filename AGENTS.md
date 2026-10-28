# CareerOS project instructions

## Commit discipline

The owner explicitly requires strong commits whenever changes are made.

- Commit completed, validated changes to the authorized private CareerOS repository. Do not leave finished work uncommitted unless a concrete access or external-state blocker prevents it.
- Keep each commit focused on a coherent behavior change. Use a specific, imperative title that names the affected feature and outcome. Prefer `feat:`, `fix:`, `test:`, or `docs:` when helpful.
- For substantive changes, explain the problem, resulting behavior, important implementation choices, and validation in the commit body. Distinguish checks actually run from checks pending in CI or requiring user action.
- Preserve unrelated work and history. Never force-push, amend shared commits, or publish to another repository or audience without authorization.
- Read the current branch head before a connected GitHub update and use its expected SHA. Reinspect conflicts rather than overwriting another change.

## Privacy and persistence

Never commit `.env`, database files, `data/`, backups, OAuth credentials, résumé or cover-letter contents/files, private exports, `node_modules/`, or `.next/`. Use an explicit source allowlist and review the diff before committing. Tests must use synthetic fixtures, never the owner's private documents.

Keep application records durable and owner-scoped. Do not replace the user's database or silently accept résumé extraction as verified qualifications. No automated emails or job submissions.

## Validation

Run checks appropriate to the change. For application changes use `npm run check`, `npm test`, and `npm run typecheck`; run `npm run build` when the framework shell or build inputs change. Never claim browser, network, hosting, or CI verification that did not occur. Use the desktop shortcut for normal user-side startup; respect this execution environment's network/listener restrictions.
