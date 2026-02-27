/**
 * Applies postgres/init.sql to the local Postgres instance.
 * Expects Postgres to already be running (e.g. via `docker compose up postgres`).
 *
 * Usage:  bun run scripts/dev-db-setup.ts
 *
 * Uses DATABASE_URL from .env, overriding the port to 5433 (host-mapped docker port).
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import pg from "pg";

const rootDir = resolve(import.meta.dirname, "..");
const envPath = resolve(rootDir, ".env");

// Minimal .env parser — just enough for DATABASE_URL / POSTGRES_* vars
const envVars: Record<string, string> = {};
for (const line of readFileSync(envPath, "utf-8").split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eq = trimmed.indexOf("=");
  if (eq === -1) continue;
  envVars[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
}

const dbUrl =
  process.env.DATABASE_URL ??
  `postgresql://${envVars.POSTGRES_USER}:${envVars.POSTGRES_PASSWORD}@localhost:5433/${envVars.POSTGRES_DB}`;

const sql = readFileSync(resolve(rootDir, "postgres/init.sql"), "utf-8");

const pool = new pg.Pool({ connectionString: dbUrl });

try {
  await pool.query(sql);
  console.log("Database initialized successfully");
} catch (err) {
  console.error("Failed to initialize database:", err);
  process.exit(1);
} finally {
  await pool.end();
}
