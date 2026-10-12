const rateLimit = require("express-rate-limit");
const crypto = require("crypto");

/**
 * Require a valid API key on mutating endpoints.
 * Disabled automatically when API_KEY is not configured (e.g. local dev).
 */
function requireApiKey(req, res, next) {
  const configured = process.env.API_KEY;

  if (!configured) {
    return next();
  }

  const provided = req.get("x-api-key");

  const ok =
    provided &&
    provided.length === configured.length &&
    crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(configured));

  if (!ok) {
    return res.status(401).json({ error: "Invalid or missing API key" });
  }

  next();
}

/** Generous limiter for read endpoints. */
const readLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please slow down." },
});

/** Strict limiter for order creation and STK push initiation. */
const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please slow down." },
});

module.exports = { requireApiKey, readLimiter, writeLimiter };
