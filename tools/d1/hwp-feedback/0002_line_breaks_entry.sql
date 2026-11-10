CREATE TABLE IF NOT EXISTS hwp_entry_totals (
  metric TEXT PRIMARY KEY CHECK (metric = 'line_breaks_hwp_entry'),
  total INTEGER NOT NULL DEFAULT 0 CHECK (typeof(total) = 'integer' AND total >= 0)
) WITHOUT ROWID;

INSERT OR IGNORE INTO hwp_entry_totals (metric) VALUES ('line_breaks_hwp_entry');

CREATE VIEW IF NOT EXISTS hwp_usage_totals (metric, total) AS
SELECT metric, total FROM hwp_entry_totals
UNION ALL
SELECT 'hwp_feedback_' || answer, total FROM hwp_feedback_totals;
