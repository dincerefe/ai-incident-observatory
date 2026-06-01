const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// DB path can be overridden via env (e.g. mounted volume on Railway/Fly).
const dbPath = process.env.DB_PATH || path.join(__dirname, '../data/observatory.db');
const bundledDbPath = path.join(__dirname, '../data/observatory.db');
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}
if (!fs.existsSync(dbPath) && bundledDbPath !== dbPath && fs.existsSync(bundledDbPath)) {
  fs.copyFileSync(bundledDbPath, dbPath);
}
const dbInstance = new sqlite3.Database(dbPath);

// Helper to run query with async/await
const db = {
  // Run a query (INSERT, UPDATE, DELETE)
  run: (sql, params = []) => {
    return new Promise((resolve, reject) => {
      dbInstance.run(sql, params, function (err) {
        if (err) {
          reject(err);
        } else {
          resolve({ lastID: this.lastID, changes: this.changes });
        }
      });
    });
  },

  // Get a single row
  get: (sql, params = []) => {
    return new Promise((resolve, reject) => {
      dbInstance.get(sql, params, (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  },

  // Get all rows
  all: (sql, params = []) => {
    return new Promise((resolve, reject) => {
      dbInstance.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows || []);
        }
      });
    });
  },

  // Run raw multiline SQL commands
  exec: (sql) => {
    return new Promise((resolve, reject) => {
      dbInstance.exec(sql, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  },

  // Close the database connection
  close: () => {
    return new Promise((resolve, reject) => {
      dbInstance.close((err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }
};

// Initialize database schema synchronously/sequentially on load
async function initDb() {
  try {
    // 1. Check if we need to migrate the schema to support new sources
    const tableCheck = await db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='incidents'");
    if (tableCheck) {
      const schema = await db.get("SELECT sql FROM sqlite_schema WHERE name='incidents'");
      if (schema && schema.sql && !schema.sql.includes("'news'")) {
        console.log("Old SQLite schema detected. Running automated zero-downtime migration to support 'news', 'avid', and 'atlas' sources...");
        try {
          await db.exec("BEGIN TRANSACTION");
          
          // Rename the old table
          await db.exec("ALTER TABLE incidents RENAME TO incidents_old");
          
          // Create the new table with expanded CHECK constraints
          await db.exec(`
            CREATE TABLE incidents (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              title TEXT NOT NULL,
              description TEXT,
              system_name TEXT,
              developer TEXT,
              category TEXT,
              subcategory TEXT,
              year INTEGER,
              month INTEGER,
              severity INTEGER CHECK(severity BETWEEN 1 AND 3),
              affected_group TEXT,
              geography TEXT,
              source_url TEXT,
              tags TEXT, -- JSON array of tags
              external_id TEXT,
              source TEXT CHECK(source IN ('aiid', 'aiaaic', 'manual', 'scraped', 'news', 'avid', 'atlas')),
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
          `);
          
          // Copy all existing records
          await db.exec(`
            INSERT INTO incidents (
              id, title, description, system_name, developer, category, subcategory,
              year, month, severity, affected_group, geography, source_url,
              tags, external_id, source, created_at, updated_at
            )
            SELECT 
              id, title, description, system_name, developer, category, subcategory,
              year, month, severity, affected_group, geography, source_url,
              tags, external_id, source, created_at, updated_at
            FROM incidents_old;
          `);
          
          // Drop the old table
          await db.exec("DROP TABLE incidents_old");
          
          await db.exec("COMMIT");
          console.log("Database schema migration completed successfully!");
        } catch (migErr) {
          try { await db.exec("ROLLBACK"); } catch (e) {}
          console.error("Migration failed, rolling back. Error:", migErr.message);
        }
      }
    }

    // 2. Enable WAL mode for better concurrent read/write performance
    await db.exec(`
      PRAGMA journal_mode=WAL;
      PRAGMA synchronous=NORMAL;
      PRAGMA cache_size=-32000;
    `);

    // 3. Perform standard table and index creation (no-op if already exists)
    await db.exec(`
      CREATE TABLE IF NOT EXISTS incidents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT,
        system_name TEXT,
        developer TEXT,
        category TEXT,
        subcategory TEXT,
        year INTEGER,
        month INTEGER,
        severity INTEGER CHECK(severity BETWEEN 1 AND 3),
        affected_group TEXT,
        geography TEXT,
        source_url TEXT,
        tags TEXT, -- JSON array of tags
        external_id TEXT,
        source TEXT CHECK(source IN ('aiid', 'aiaaic', 'manual', 'scraped', 'news', 'avid', 'atlas')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_incidents_year        ON incidents(year);
      CREATE INDEX IF NOT EXISTS idx_incidents_category    ON incidents(category);
      CREATE INDEX IF NOT EXISTS idx_incidents_developer   ON incidents(developer);
      CREATE INDEX IF NOT EXISTS idx_incidents_external_id ON incidents(external_id);
      CREATE INDEX IF NOT EXISTS idx_incidents_severity    ON incidents(severity);
      CREATE INDEX IF NOT EXISTS idx_incidents_source      ON incidents(source);
      CREATE INDEX IF NOT EXISTS idx_inc_cat_sev           ON incidents(category, severity);
      CREATE INDEX IF NOT EXISTS idx_inc_year_sev          ON incidents(year, severity);
    `);

    // 4. Ethics feature tables
    await db.exec(`
      CREATE TABLE IF NOT EXISTS ethical_questions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        question_text TEXT NOT NULL,
        question_type TEXT CHECK(question_type IN ('scale', 'multiple_choice', 'binary')) NOT NULL,
        option_a TEXT NOT NULL,
        option_b TEXT NOT NULL,
        option_c TEXT,
        option_d TEXT,
        category TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS ai_profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        model_version TEXT NOT NULL,
        description TEXT,
        color_hex TEXT DEFAULT '#0071e3',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(name, model_version)
      );

      CREATE TABLE IF NOT EXISTS ai_answers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ai_profile_id INTEGER NOT NULL REFERENCES ai_profiles(id),
        question_id INTEGER NOT NULL REFERENCES ethical_questions(id),
        answer_value INTEGER NOT NULL,
        UNIQUE(ai_profile_id, question_id)
      );

      CREATE TABLE IF NOT EXISTS user_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL UNIQUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS user_answers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        question_id INTEGER NOT NULL REFERENCES ethical_questions(id),
        answer_value INTEGER NOT NULL,
        UNIQUE(session_id, question_id)
      );

      CREATE INDEX IF NOT EXISTS idx_ai_answers_profile   ON ai_answers(ai_profile_id);
      CREATE INDEX IF NOT EXISTS idx_ai_answers_question  ON ai_answers(question_id);
      CREATE INDEX IF NOT EXISTS idx_user_answers_session ON user_answers(session_id);
    `);

    // Add user_id column to user_sessions if not present (migration)
    try {
      await db.exec('ALTER TABLE user_sessions ADD COLUMN user_id TEXT');
    } catch (e) {
      // Column already exists — ignore
    }

    console.log(`Database initialized successfully at: ${dbPath}`);
  } catch (err) {
    console.error('Database initialization failed:', err.message);
  }
}

const ready = initDb();

module.exports = db;
module.exports.ready = ready;
