CREATE TABLE gmail_connections (
 user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 email TEXT NOT NULL, encrypted_token TEXT NOT NULL, connected_at TEXT NOT NULL,
 last_attempt_at TEXT, last_success_at TEXT, last_error TEXT,
 page_token TEXT, active_query TEXT
);
CREATE TABLE gmail_oauth_states (
 state_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 encrypted_verifier TEXT NOT NULL, expires_at INTEGER NOT NULL
);
CREATE TABLE gmail_messages (
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 message_id TEXT NOT NULL, thread_id TEXT NOT NULL, received_at TEXT NOT NULL,
 company TEXT NOT NULL DEFAULT '', title TEXT NOT NULL DEFAULT '', status TEXT,
 confidence REAL NOT NULL, summary TEXT NOT NULL, contact TEXT NOT NULL DEFAULT '',
 review_state TEXT NOT NULL CHECK(review_state IN ('pending','linked','ignored')),
 application_id TEXT REFERENCES applications(id) ON DELETE SET NULL,
 reason TEXT NOT NULL DEFAULT '', PRIMARY KEY(user_id,message_id)
);
CREATE INDEX gmail_review_owner ON gmail_messages(user_id,review_state,received_at);
