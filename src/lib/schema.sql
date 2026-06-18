-- SQLite schema for persisting the Ara Cinta Indonesia content desk.
-- The current first screen works client-side; wire these tables through a server action
-- when you are ready to save drafts beyond the browser session.

CREATE TABLE IF NOT EXISTS articles (
  id TEXT PRIMARY KEY,
  topic TEXT NOT NULL,
  purpose TEXT NOT NULL,
  korean_memo TEXT NOT NULL,
  reference_links TEXT,
  experience_date TEXT,
  place_or_product TEXT,
  category TEXT,
  tags TEXT,
  internal_links TEXT,
  publish_date TEXT,
  body_html TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  adsense_score_json TEXT,
  publish_package_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS images (
  id TEXT PRIMARY KEY,
  article_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  role TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  alt TEXT NOT NULL,
  placement TEXT,
  storage_url TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS wordpress_posts (
  id TEXT PRIMARY KEY,
  article_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  wordpress_post_id INTEGER,
  wordpress_link TEXT,
  status TEXT NOT NULL,
  last_synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
