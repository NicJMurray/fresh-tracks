CREATE TABLE IF NOT EXISTS playlists (
  id TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  first_seen TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  changed_at TEXT,
  used_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS snapshots (
  playlist_id TEXT NOT NULL,
  day TEXT NOT NULL,
  payload TEXT NOT NULL,
  PRIMARY KEY (playlist_id, day)
);
CREATE INDEX IF NOT EXISTS snapshots_day ON snapshots(day);
CREATE TABLE IF NOT EXISTS search_cache (
  query TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  fetched_at TEXT NOT NULL
);
