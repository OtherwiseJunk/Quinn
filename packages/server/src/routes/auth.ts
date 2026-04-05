import { Router } from "express";
import passport from "../auth/passport.js";
import type { OAuthUser } from "../auth/passport.js";
import { requireSession } from "../middleware/requireSession.js";
import { env } from "../config.js";

const router = Router();

router.get("/login", passport.authenticate("discord"));

router.get("/callback", (req, res, next) => {
  passport.authenticate("discord", (err: Error | null, oauthUser: OAuthUser | false) => {
    if (err || !oauthUser) return res.redirect("/api/auth/login");

    // Extract the token before logging in — req.logIn triggers session.regenerate()
    // which would wipe anything written to the session before this point.
    const { _discordAccessToken, ...cleanUser } = oauthUser;

    req.logIn(cleanUser, (loginErr) => {
      if (loginErr) return next(loginErr);
      // Session has been regenerated. Now it's safe to write the token.
      req.session.discordAccessToken = _discordAccessToken;
      req.session.save(() => res.redirect(env.uiUrl));
    });
  })(req, res, next);
});

router.get("/me", requireSession, (req, res) => {
  res.json(req.user);
});

router.post("/logout", requireSession, (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    res.json({ ok: true });
  });
});

export default router;
