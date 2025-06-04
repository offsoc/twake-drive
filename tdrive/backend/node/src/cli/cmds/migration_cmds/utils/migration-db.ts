import Database from "better-sqlite3";
const db = new Database("migration_log.db", {});
db.pragma("journal_mode = WAL");

db.prepare(
  `
  CREATE TABLE IF NOT EXISTS migration_report (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_email TEXT,
    user_id TEXT,
    file_id TEXT,
    file_name TEXT,
    success INTEGER,
    reason TEXT,
    stacktrace TEXT,
    migrated_at INTEGER
  )
`,
).run();

export default db;
