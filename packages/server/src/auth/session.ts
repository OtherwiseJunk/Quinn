import session from "express-session";

declare module "express-session" {
  interface SessionData {
    discordAccessToken?: string;
  }
}
import connectPgSimple from "connect-pg-simple";
import { pool } from "../db/pool.js";
import { env } from "../config.js";

const PgStore = connectPgSimple(session);

export const sessionMiddleware = session({
  store: new PgStore({
    pool,
    createTableIfMissing: true,
  }),
  secret: env.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: env.nodeEnv === "production",
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  },
});
