import { Router } from "express";
import authRouter from "./auth.js";
import userRouter from "./user.js";
import guildsRouter from "./guilds.js";
import botRouter from "./bot.js";
import adminRouter from "./admin.js";

const router = Router();

router.get("/health", (_req, res) => res.json({ status: "ok" }));

router.use("/auth", authRouter);
router.use("/user", userRouter);
router.use("/guilds/:guildId", guildsRouter);
router.use("/bot", botRouter);
router.use("/admin", adminRouter);

export default router;
