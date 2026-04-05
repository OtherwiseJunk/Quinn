import pg from "pg";
import { env } from "../config.js";

export const pool = new pg.Pool({ connectionString: env.databaseUrl });
