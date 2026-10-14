import rateLimit from "express-rate-limit";

const base = {
  standardHeaders: "draft-7" as const, // sends RateLimit headers
  legacyHeaders: false,
};

// Broad safety net for every API call (per IP)
export const apiLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000,
  limit: 600,
  message: { error: "Too many requests. Please slow down." },
});

// Login: only FAILED attempts count, so normal users are never blocked
export const loginLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  message: { error: "Too many login attempts. Try again in 15 minutes." },
});

// Registration: limit account spam (per IP)
export const registerLimiter = rateLimit({
  ...base,
  windowMs: 60 * 60 * 1000,
  limit: 10,
  message: { error: "Too many sign-ups from this network. Try again later." },
});

// Anything that calls the model (per user, so it must run after requireAuth)
export const modelLimiter = rateLimit({
  ...base,
  windowMs: 60 * 1000,
  limit: 15,
  keyGenerator: (_req, res) => `user-${res.locals.userId}`,
  message: { error: "You're sending messages too fast. Wait a moment." },
});

// File uploads trigger CPU-heavy embedding work (per user)
export const uploadLimiter = rateLimit({
  ...base,
  windowMs: 60 * 60 * 1000,
  limit: 20,
  keyGenerator: (_req, res) => `user-${res.locals.userId}`,
  message: { error: "Too many uploads. Try again later." },
});