import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "./schema";

const dbPath = "bank.db";

const sqlite = new Database(dbPath);
export const db = drizzle(sqlite, { schema });

// Track connections so we can close them on shutdown to avoid resource leaks
const connections: Database.Database[] = [sqlite];

export function initDb() {
  const conn = new Database(dbPath);
  connections.push(conn);

  // Create tables if they don't exist
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      phone_number TEXT NOT NULL,
      date_of_birth TEXT NOT NULL,
      ssn TEXT NOT NULL,
      address TEXT NOT NULL,
      city TEXT NOT NULL,
      state TEXT NOT NULL,
      zip_code TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      account_number TEXT UNIQUE NOT NULL,
      account_type TEXT NOT NULL,
      balance REAL DEFAULT 0 NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL REFERENCES accounts(id),
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'pending' NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      processed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      token TEXT UNIQUE NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

// Initialize database on import
initDb();

export function closeAllDbConnections() {
  for (const conn of connections) {
    try {
      conn.close();
    } catch (e) {
      // log but continue
      // eslint-disable-next-line no-console
      console.warn('Error closing DB connection', e);
    }
  }
}

// Ensure DB connections are closed on process exit/signals to prevent resource leaks
function handleShutdown(signal?: string) {
  // eslint-disable-next-line no-console
  console.log('Shutting down DB connections', signal || 'exit');
  try {
    closeAllDbConnections();
  } finally {
    if (signal && signal !== 'exit') process.exit(0);
  }
}

process.on('exit', () => handleShutdown('exit'));
process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('uncaughtException', (err) => {
  // eslint-disable-next-line no-console
  console.error('Uncaught exception, closing DB connections', err);
  handleShutdown('uncaughtException');
});
