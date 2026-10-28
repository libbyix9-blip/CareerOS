# Connect Gmail to CareerOS

The read-only OAuth flow, six-month initial backfill, incremental sync, conservative extraction, per-role grouping, evidence links, and manual review workflow are implemented. They have synthetic tests; no real Gmail authorization or import is claimed until you configure and test your own connection.

1. Open Google Cloud Console, select or create a project, and enable the **Gmail API**.
2. Configure the Google OAuth consent screen. For a personal app in Testing mode, add your Gmail account as a test user. Google's testing/verification rules can affect refresh-token lifetime; reconnect if Google revokes or expires access.
3. Create an OAuth client of type **Web application**. Add this exact authorized redirect URI for the default local setup:

   `http://127.0.0.1:3000/api/gmail/callback`

4. In the ignored local `.env` file, set `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, and `GMAIL_TOKEN_KEY`. Generate the key in Terminal using `openssl rand -hex 32`. Keep the same key while a connection is stored; if it is lost, reconnect rather than trying to decrypt with a replacement. Do not paste any of these values into chat, browser forms, source files, or GitHub.
5. Start or restart CareerOS, open **Settings → Gmail application intelligence → Connect Gmail**, and authorize your Google account. The app requests only `https://www.googleapis.com/auth/gmail.readonly`; it has no API path to send mail or apply for jobs.

After connection, opening the authenticated app starts discovery and Gmail synchronization. Each service coalesces recent/active work. A sync reads up to four pages of 50 matching messages; a retained page cursor continues on the next open/manual sync. The initial query covers six months, and completed backfills use an overlapping incremental window. The app does not require Gmail to use the job feeds or manual tracker.

## Review behavior

Only explicit application confirmations with a clear company and role may create an automatic application record. Unmatched outreach, interviews, offers, rejections, and ambiguous records enter the review queue rather than inventing an application date. Existing applications match on normalized employer plus title, or an unambiguous already-linked email thread. Different roles at the same employer remain separate.

Later meaningful messages can update auto-imported records. Messages older than the current update do not regress status. A newer conflict with a manually corrected status is queued for review. In Settings, select **Review updates**, choose an existing application or create a separate one, verify the company/title/date/status, and confirm. Choosing the record also permits splitting an ambiguous thread into a different role without merging company-wide records. Ignoring an update changes only CareerOS, not the Gmail message.

Status and entity detection is conservative rule-based extraction, not verified AI reasoning. Search coverage and message formats vary. Review the original message and correct any error. Gmail subject lines, sender/contact, dates, concise event metadata, confidence, message IDs and evidence links are stored; full bodies and attachments are not persisted. A review item with an unknown date requires you to supply an application date.

## Security and deletion

Refresh tokens and PKCE verifiers are encrypted with AES-256-GCM using the server-only key. OAuth state expires, is single-use, and is bound to an HttpOnly SameSite=Lax callback cookie. Account sessions remain HttpOnly/SameSite=Strict. All connection, message and review reads/writes are owner-scoped; account deletion cascades these records and attempts token revocation. Disconnect attempts Google revocation and removes the local connection; imported applications remain. If Google cannot be reached, remove access in your Google Account permissions as well.

The Google credential values, encrypted tokens, original emails and private database must never enter the source repository. The ChatGPT Gmail connector and this application's OAuth connection are separate: an existing connected app in chat does not automatically grant this local server a refresh token.

References: [Google OAuth web-server flow](https://developers.google.com/identity/protocols/oauth2/web-server), [Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes), [messages.list](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/list).
