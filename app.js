import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import ejs from "ejs";
import bodyParser from "body-parser";
import cors from "cors";
import "dotenv/config";
import cookieParser from "cookie-parser";
import authRequire from "./utils/utils.js";
import supabase from "./db/supabase.js";
import authRouter from "./routes/auth.js";
import groupsRouter from "./routes/groups.js"
import eventsRouter from "./routes/events.js"
import todoRouter from "./routes/todo.js"
import emailRouter from "./routes/email.js"
import { startScheduler } from "./utils/scheduler.js"

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());
app.use(cors());
app.use(cookieParser());

app.set("port", process.env.PORT || 3000);
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Need to set the Router after all middleware is configured.
app.use('/', authRouter);
app.use('/', groupsRouter);
app.use('/', eventsRouter);
app.use('/', todoRouter);
app.use('/', emailRouter);

app.post('/refresh-session', authRequire, (req, res) => {
  // authRequire already refreshes cookies if needed; just confirm alive
  return res.json({ success: true });
});

app.listen(app.get("port"), () => {
  console.log(`Listening on port: ${app.get("port")}`);
  startScheduler();
});

app.get("/calendar", authRequire, async (req, res) => {
  
  const {data: groupsIds, error: groupsIdsError} = await req.supabase
  .from('groups')
  .select(`groups_id, tag_name,
    profiles_groups!inner(
    user_id
    )`)
  .eq('profiles_groups.user_id', req.cookies.userId);

  if (groupsIdsError) {
    res.status(500).json({success: false, error: groupsIdsError.message})
  }

  let groupsTagNames = {};
  groupsIds.filter(g => g.tag_name !== null).forEach(g => {
    groupsTagNames[g.groups_id] = g.tag_name
  })

  res.render("calendar.ejs", {groupsTagNames: groupsTagNames, currentPage: 'calendar'});
});


//Load the User login pages
app.get("/", authRequire, (req, res) => {
  res.redirect("/calendar");
});

app.get('/healthz',(req, res) => {
  return res.json({success: true, datetime: new Date().toISOString()})
})