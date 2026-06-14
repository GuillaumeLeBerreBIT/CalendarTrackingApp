import * as Sentry from "@sentry/node";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import bodyParser from "body-parser";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import "dotenv/config";
import cookieParser from "cookie-parser";

Sentry.init({
  dsn: process.env.SENTRY_DSN_KEY,
  environment: process.env.NODE_ENV ?? 'development',
  enabled: !!process.env.SENTRY_DSN_KEY,
  tracesSampleRate: 0.2,
});
import authRequire from "./utils/utils.js";
import authRouter from "./routes/auth.js";
import groupsRouter from "./routes/groups.js"
import eventsRouter from "./routes/events.js"
import todoRouter from "./routes/todo.js"
import emailRouter from "./routes/email.js"
import discoveryRouter from "./routes/discovery.js"
import notificationsRouter from "./routes/notifications.js"
import savedRouter from "./routes/saved.js"
import icalRouter from "./routes/ical.js"
import habitRouter from "./routes/habits.js"
import timerRouter from "./routes/timers.js"
import challengeRouter from "./routes/challenges.js"
import pactRouter from "./routes/pacts.js"
import billingRouter from "./routes/billing.js"
import { startScheduler } from "./utils/scheduler.js"

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Render (and most PaaS) put exactly one proxy in front of the app. Trust that
// single hop so express-rate-limit and req.ip read the real client IP from
// X-Forwarded-For. Trusting more hops would let clients spoof their IP.
app.set('trust proxy', 1);

const isProd = process.env.NODE_ENV === 'production';

// Content Security Policy. Notes on the non-'self' entries:
//  - styleSrc 'unsafe-inline': the UI is built almost entirely with inline styles.
//  - imgSrc https:/data:: event cover images are user-pasted URLs and Ticketmaster
//    art comes from many CDN hosts, so an exact allowlist isn't feasible.
//  - connectSrc sentry.*: lets the browser SDK ship error reports.
// Stripe Checkout/Portal are full-page redirects (not embedded), so no Stripe
// host needs to be allowed here.
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      fontSrc: ["'self'", 'data:'],
      connectSrc: ["'self'", 'https://*.sentry.io', 'https://*.ingest.sentry.io', 'https://*.ingest.de.sentry.io'],
      workerSrc: ["'self'"],
      manifestSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'self'"],
      formAction: ["'self'"],
      // Only force-upgrade to HTTPS in production; leave plain localhost alone in dev.
      upgradeInsecureRequests: isProd ? [] : null,
    },
  },
}));

app.use((req, res, next) => {
  if (process.env.NODE_ENV === 'production' && req.headers['x-forwarded-proto'] !== 'https') {
    return res.redirect(301, `https://${req.headers.host}${req.url}`);
  }
  next();
});

app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? process.env.APP_URL
    : ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true,
}));

// Stripe webhooks need the raw body — register before express.json()
app.use('/api/billing/webhook', express.raw({ type: 'application/json' }));

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());

// Global rate limit on all /api routes (generous — mainly stops scripted abuse).
// Skip the Stripe webhook: it's signature-verified, can arrive in bursts, and a
// 429 would make Stripe mark delivery failed and retry.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.originalUrl.startsWith('/api/billing/webhook'),
});
app.use('/api', apiLimiter);

app.set("port", process.env.PORT || 3000);

app.use('/api', authRouter);
app.use('/api', groupsRouter);
app.use('/api', eventsRouter);
app.use('/api', todoRouter);
app.use('/api', emailRouter);
app.use('/api', discoveryRouter);
app.use('/api', notificationsRouter);
app.use('/api', savedRouter);
app.use('/api', icalRouter);
app.use('/api', habitRouter);
app.use('/api', timerRouter);
app.use('/api', challengeRouter);
app.use('/api', pactRouter);
app.use('/api/billing', billingRouter);

app.post('/api/refresh-session', authRequire, (req, res) => {
  return res.json({ success: true });
});

app.get('/healthz', (req, res) => {
  return res.json({ success: true, datetime: new Date().toISOString() });
});

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'client/dist'), {
    setHeaders(res, filePath) {
      // Content-hashed bundles are immutable — cache them forever.
      if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      } else {
        // HTML shell + service worker must always revalidate so deploys land.
        res.setHeader('Cache-Control', 'no-cache');
      }
    },
  }));
  app.get('/*splat', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(__dirname, 'client/dist/index.html'));
  });
}

// Sentry error handler — must be after all routes
Sentry.setupExpressErrorHandler(app);

app.listen(app.get("port"), () => {
  console.log(`Listening on port: ${app.get("port")}`);
  startScheduler();
});