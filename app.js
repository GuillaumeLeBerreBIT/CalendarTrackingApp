import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import bodyParser from "body-parser";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import "dotenv/config";
import cookieParser from "cookie-parser";
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
import { startScheduler } from "./utils/scheduler.js"

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(helmet({ contentSecurityPolicy: false }));

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

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());

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

app.post('/api/refresh-session', authRequire, (req, res) => {
  return res.json({ success: true });
});

app.get('/healthz', (req, res) => {
  return res.json({ success: true, datetime: new Date().toISOString() });
});

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'client/dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'client/dist/index.html'));
  });
}

app.listen(app.get("port"), () => {
  console.log(`Listening on port: ${app.get("port")}`);
  startScheduler();
});