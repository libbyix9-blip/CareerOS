CREATE TABLE career_documents (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('resume','cover-letter')),
  title TEXT NOT NULL, filename TEXT NOT NULL, mime_type TEXT NOT NULL,
  size INTEGER NOT NULL DEFAULT 0, content_hash TEXT NOT NULL,
  original_file BLOB, original_text TEXT NOT NULL, text TEXT NOT NULL,
  suggested_skills TEXT NOT NULL DEFAULT '[]', reviewed_skills TEXT NOT NULL DEFAULT '[]',
  review_status TEXT NOT NULL DEFAULT 'pending' CHECK(review_status IN ('pending','reviewed')),
  is_primary INTEGER NOT NULL DEFAULT 0,
  bucket TEXT NOT NULL DEFAULT 'General / Review', bucket_reviewed INTEGER NOT NULL DEFAULT 0,
  company TEXT NOT NULL DEFAULT '', role TEXT NOT NULL DEFAULT '',
  source_url TEXT NOT NULL DEFAULT '', source_label TEXT NOT NULL DEFAULT '',
  parent_id TEXT REFERENCES career_documents(id) ON DELETE SET NULL,
  job_id TEXT REFERENCES jobs(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX career_documents_owner_kind ON career_documents(user_id,kind,updated_at);
CREATE UNIQUE INDEX career_documents_original_dedup ON career_documents(user_id,kind,content_hash) WHERE parent_id IS NULL;
CREATE UNIQUE INDEX career_documents_one_primary ON career_documents(user_id) WHERE is_primary=1 AND kind='resume';
