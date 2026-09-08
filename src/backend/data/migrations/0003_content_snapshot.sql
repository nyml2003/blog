CREATE TABLE content_snapshot (
    singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
    source_commit TEXT NOT NULL,
    snapshot_json TEXT NOT NULL
);
