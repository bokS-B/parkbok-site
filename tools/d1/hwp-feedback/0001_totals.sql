CREATE TABLE IF NOT EXISTS hwp_feedback_totals (
  answer TEXT PRIMARY KEY CHECK (answer IN ('ok', 'problem', 'not_opened')),
  total INTEGER NOT NULL DEFAULT 0 CHECK (total >= 0)
) WITHOUT ROWID;

INSERT OR IGNORE INTO hwp_feedback_totals (answer) VALUES ('ok'), ('problem'), ('not_opened');
