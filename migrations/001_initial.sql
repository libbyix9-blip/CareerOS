CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
  preferences TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS login_attempts (
  key TEXT PRIMARY KEY, attempts INTEGER NOT NULL DEFAULT 0, reset_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL UNIQUE, company TEXT NOT NULL,
  title TEXT NOT NULL, location TEXT NOT NULL, arrangement TEXT NOT NULL,
  salary_min INTEGER, salary_max INTEGER, currency TEXT, salary_text TEXT,
  description TEXT NOT NULL, qualifications TEXT, url TEXT NOT NULL,
  posted_at TEXT, discovered_at TEXT NOT NULL, verified_at TEXT NOT NULL,
  availability TEXT NOT NULL DEFAULT 'Open'
);
CREATE TABLE IF NOT EXISTS job_postings (
  source_key TEXT NOT NULL, source_job_id TEXT NOT NULL,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  url TEXT NOT NULL, available INTEGER NOT NULL DEFAULT 1,
  verified_at TEXT NOT NULL,
  PRIMARY KEY(source_key,source_job_id)
);
CREATE INDEX IF NOT EXISTS job_postings_job ON job_postings(job_id);
CREATE TABLE IF NOT EXISTS job_states (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  saved INTEGER NOT NULL DEFAULT 0, dismissed INTEGER NOT NULL DEFAULT 0,
  feedback TEXT, updated_at TEXT NOT NULL,
  PRIMARY KEY(user_id,job_id)
);
CREATE TABLE IF NOT EXISTS applications (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company TEXT NOT NULL, title TEXT NOT NULL, location TEXT NOT NULL DEFAULT '',
  applied_at TEXT NOT NULL, source TEXT NOT NULL DEFAULT 'Manual',
  status TEXT NOT NULL DEFAULT 'Applied' CHECK(status IN ('Applied','In Review','Recruiter Contact','Interviewing','Assessment','Offer','Rejected','Withdrawn','No Response')),
  updated_at TEXT NOT NULL, last_response_at TEXT,
  contact TEXT NOT NULL DEFAULT '', summary TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT '', job_id TEXT REFERENCES jobs(id) ON DELETE SET NULL,
  manual_override INTEGER NOT NULL DEFAULT 1, needs_review INTEGER NOT NULL DEFAULT 0,
  confidence REAL, evidence TEXT NOT NULL DEFAULT '[]',
  UNIQUE(user_id,job_id)
);
CREATE INDEX IF NOT EXISTS applications_owner_date ON applications(user_id,applied_at);
CREATE TABLE IF NOT EXISTS activity (
  id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL, summary TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS activity_owner_date ON activity(user_id,created_at);
CREATE TABLE IF NOT EXISTS source_runs (
  id TEXT PRIMARY KEY, source_key TEXT NOT NULL, started_at TEXT NOT NULL,
  finished_at TEXT, success INTEGER NOT NULL DEFAULT 0, count INTEGER NOT NULL DEFAULT 0,
  error TEXT
);
CREATE INDEX IF NOT EXISTS runs_source_time ON source_runs(source_key,started_at);
CREATE TABLE IF NOT EXISTS locks (key TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);
