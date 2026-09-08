CREATE TABLE content_workflow (
    singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
    revision INTEGER NOT NULL CHECK (revision > 0),
    state_json TEXT NOT NULL
);
