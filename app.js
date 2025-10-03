import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import ejs from "ejs";
import bodyParser from "body-parser";
import cors from "cors";
import "dotenv/config";
import bcrypt from "bcrypt";
import cookieParser from "cookie-parser";
import { createClient } from "@supabase/supabase-js";
import validatePassword from "./utils/utils.js";
import { stat } from "fs";

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(
  "https://fhaffbgrrepbowirthcb.supabase.co",
  supabaseKey
);

const authRequire = async function (req, res, next) {
  const supaToken = req.cookies.authCookie;

  if (!supaToken) {
    return res.redirect("/login");
  }

  const { data, error } = await supabase.auth.getUser(supaToken);

  if (error || !data.user) {
    res.clearCookie("authCookie");
    return res.redirect("login");
  }

  req.user = data.user;

  next();
};

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());
app.use(cors());
app.use(cookieParser());

const SALT_ROUNDS = 10;

app.set("port", process.env.PORT || 3000);
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.listen(app.get("port"), () => {
  console.log(`Listening on port: ${app.get("port")}`);
});

app.get("/", authRequire, (req, res) => {
  res.render("index.ejs");
});

app.get("/calendar", authRequire, (req, res) => {
  res.render("calendar.ejs");
});

app.get("/todo", authRequire, (req, res) => {
  res.render("todo.ejs");
});

app.get("/groups", authRequire, async (req, res) => {
  const { data: groups, error } = await supabase.from("groups").select(`
        *,
        profiles_groups (
        *,
        profiles (
        *)
        )
        `);

  if (groups && groups.length > 0) {
    console.log(groups[0].user_groups);
  } else {
    console.log("No user groups found.");
  }
  res.render("groups.ejs");
});

app.post("/create-group", authRequire, async (req, res) => {
  try {
    // Handle the creation of the User who creates the group.
    const { data: newGroup, error: groupError } = await supabase
      .from("groups")
      .insert([
        {
          groups_title: req.body["group-title"],
          groups_description: req.body["group-description"] || null,
          tag_name: req.body["tag-name"] || null,
        },
      ])
      .select();

    if (groupError) {
      return res
        .status(400)
        .render("groups.ejs", { success: false, message: groupError.message });
    }

    const { data: newProfile, error: profileError } = await supabase
      .from("profiles_groups")
      .insert([
        {
          groups_id: newGroup[0].groups_id,
          user_id: req.user.id,
          role: "admin",
          invite_status: "accepted",
        },
      ])
      .select();

    if (profileError) {
      await supabase
        .from("groups")
        .delete()
        .eq(groups_id, newGroup[0].groups_id);
      return res.status(400).render("groups.ejs", {
        success: false,
        message: "Failed to add the creator as admin.",
      });
    }

    // Handle the invitation of ONE member. (Will implement multiple later.)
    if (req.body["invite-user"]) {
      const { data: profileMatches, error: noMatches } = await supabase
        .from("profiles")
        .select("username")
        .eq("username", req.body["invite-user"]);

      if (profileMatches && profileMatches.length > 0) {
        const { data: userInvite, error: inviteError } = await supabase
          .from("profile_groups")
          .insert([
            {
              user_id: profileMatches[0].user_id,
              groups_id: newGroup.groups_id,
              role: 'member',
              invite_status: 'pending',
            },
          ]);

        if (inviteError) {
            console.log('groups.ejs', {success: false, message: 'Group created, but unable to add user to the group.'})
        }
      }
    }

    console.log(req.body);

    res.render("groups.ejs", {success: true, message: 'Group created succesfully.'});

  } catch (error) {
    res
      .status(500)
      .render("groups.ejs", { succes: false, message: error.message });
  }
});

//Load the User login pages
app.get("/login", (req, res) => {
  res.render("login.ejs");
});

app.get("/register", (req, res) => {
  res.render("register.ejs");
});
// Processing the user login form.
app.post("/login", async (req, res) => {
  console.log(req.body);
  //Now need to login the user

  const { data, error } = await supabase.auth.signInWithPassword({
    email: req.body["email"],
    password: req.body["password"],
  });

  if (error) {
    return res
      .status(400)
      .render("login.ejs", { succes: false, message: error.message });
  } else {
    res.cookie("authCookie", data.session.access_token, {
      maxAge: 3 * 60 * 60 * 1000,
      httpOnly: true,
    });

    res.redirect("/groups");
  }
});

app.post("/register", async (req, res) => {
  console.log(req.body);
  // Need to register a user and then also log in direclty.

  if (req.body["password"] != req.body["passwordConfirm"]) {
    return res.status(422).render("register.ejs", {
      succes: false,
      error: "Make sure the passwords entered are identical to each other.",
    });
  }

  const [isValid, messageSuccess] = validatePassword(req.body["password"]);

  if (!isValid) {
    return res
      .status(422)
      .render("register.ejs", { succes: false, error: messageSuccess });
  }

  // let hash_pass = await bcrypt.hash(req.body['password'], SALT_ROUNDS)
  // console.log(hash_pass);
  const { data, error } = await supabase.auth.signUp({
    email: req.body["email"],
    password: req.body["password"],
    options: {
      data: {
        username: req.body["username"],
      },
    },
  });
  const refreshToken = data.session.refresh_token;

  if (error) {
    return res
      .status(400)
      .render("register.ejs", { succes: false, error: error.message });
  } else {
    res.cookie("authCookie", data.session.access_token, {
      maxAge: 3 * 60 * 60 * 1000,
      httpOnly: true,
    });
    res.redirect("/groups");
  }
});

app.post("/logout", async (req, res) => {
  res.clearCookie("authCookie");
  res.redirect("/login");
});

//API Endpoints
app.post("/addEvent", async (req, res) => {
  console.log(req.body);

  const { data, error } = await supabase
    .from("CalendarEvents")
    .insert([
      {
        title: req.body["title"],
        startDate: req.body["startDate"],
        endDate: req.body["endDate"],
      },
    ])
    .select();

  console.log(data, error);

  if (error) {
    res.status(400).json({ succes: false, error: error.message });
  } else {
    res.json({ succes: true, data });
  }
});
