-- Search-only projection. The authoritative article HTML remains unchanged.
CREATE VIRTUAL TABLE IF NOT EXISTS article_search_fts USING fts5(
    title,
    summary,
    content_html,
    content='articles',
    content_rowid='id',
    tokenize='trigram'
);

INSERT INTO article_search_fts(rowid, title, summary, content_html)
SELECT id, title, summary, content_html FROM articles
WHERE NOT EXISTS (SELECT 1 FROM article_search_fts LIMIT 1);

CREATE TRIGGER IF NOT EXISTS article_search_fts_insert
AFTER INSERT ON articles BEGIN
  INSERT INTO article_search_fts(rowid, title, summary, content_html)
  VALUES (new.id, new.title, new.summary, new.content_html);
END;

CREATE TRIGGER IF NOT EXISTS article_search_fts_delete
AFTER DELETE ON articles BEGIN
  INSERT INTO article_search_fts(article_search_fts, rowid, title, summary, content_html)
  VALUES ('delete', old.id, old.title, old.summary, old.content_html);
END;

CREATE TRIGGER IF NOT EXISTS article_search_fts_update
AFTER UPDATE OF title, summary, content_html ON articles BEGIN
  INSERT INTO article_search_fts(article_search_fts, rowid, title, summary, content_html)
  VALUES ('delete', old.id, old.title, old.summary, old.content_html);
  INSERT INTO article_search_fts(rowid, title, summary, content_html)
  VALUES (new.id, new.title, new.summary, new.content_html);
END;
