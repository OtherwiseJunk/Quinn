import express, {Response, Request, NextFunction} from "express";
import "./auth/passport.js"; // registers the passport strategy as a side effect
import passport from "passport";
import { sessionMiddleware } from "./auth/session.js";
import apiRouter from "./routes/index.js";

const app = express();

app.use(express.json());
app.use(sessionMiddleware);
app.use(passport.initialize());
app.use(passport.session());

app.use("/api", apiRouter);

// Global error handler
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

export default app;
