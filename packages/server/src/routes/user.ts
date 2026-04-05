import { Router } from "express";
import { requireSession } from "../middleware/requireSession.js";
import { getUserContext, upsertUserContext } from "../db/userContext.js";
import { asyncHandler } from "../lib/asyncHandler.js";

const router = Router();

router.use(requireSession);

router.get("/context", asyncHandler(async (req, res) => {
  const context = await getUserContext(req.user!.discordUserId);
  res.json({ userContext: context });
}));

router.put("/context", asyncHandler(async (req, res) => {
  const { context } = req.body as { context: string };
  if (typeof context !== "string" || context.length > 500) {
    res.status(400).json({ error: "context must be a string of 500 characters or fewer" });
    return;
  }
  const updated = await upsertUserContext(req.user!.discordUserId, context);
  res.json(updated);
}));

export default router;
