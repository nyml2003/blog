CREATE TABLE share_attribution (
    token TEXT PRIMARY KEY,
    article_id INTEGER NOT NULL,
    created_at_epoch INTEGER NOT NULL
);

CREATE INDEX share_attribution_created_at_idx
    ON share_attribution (created_at_epoch);
