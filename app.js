import express from "express";
import path from "path";
import { fileURLToPath } from 'url';
import ejs from "ejs";
import bodyParser from "body-parser";
import cors from "cors";
import 'dotenv/config';
import bcrypt from 'bcrypt';
import { createClient } from '@supabase/supabase-js';
import validatePassword from './utils/utils.js';

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const supabaseKey = process.env.SUPABASE_KEY
const supabase = createClient(
    'https://fhaffbgrrepbowirthcb.supabase.co', 
    supabaseKey
);

const authRequire = function (req, res, next) {
    
    next();
};

app.use(bodyParser.urlencoded({extended: true}));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(cors());

const SALT_ROUNDS = 10;

app.set('port', process.env.PORT || 3000);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.listen(app.get('port'), () => {
    console.log(`Listening on port: ${app.get('port')}`)
})

app.get('/', (req, res) => {
    res.render('index.ejs');
});

app.get('/calendar', (req, res) => {
    res.render('calendar.ejs');
});

app.get('/todo', (req, res) => {
    
    res.render('todo.ejs');
});

app.get('/groups', (req, res) => {

    res.render('groups.ejs');
})

//Load the User login pages
app.get('/login', (req, res) => {

    res.render('login.ejs');
});

app.get('/register', (req, res) => {

    res.render('register.ejs');
}); 
// Processing the user login form.
app.post('/login', async (req, res) => {
    console.log(req.body);
    //Now need to login the user

    const {data, error} = await supabase.auth.signInWithPassword({
        email: req.body['email'],
        password: req.body['password']
    });

    if (error) {
        return res.status(400).render('login.ejs', {succes: false, message: error.message});
    } else {
        res.render('groups.ejs');
    }
})

app.post('/register', async (req, res) => {
    console.log(req.body);
    // Need to register a user and then also log in direclty.
    let isValid, messageSuccess;

    if (req.body['password'] != req.body['passwordConfirm']) {
        
        return res.status(422).render('register.ejs', {succes: false, error: 'Make sure the passwords entered are identical to each other.'});
    }

    [isValid, messageSuccess] = validatePassword(req.body['password']);

    if (!isValid) {
        return res.status(422).render('register.ejs', {succes: false, error: messageSuccess})
    }

    // let hash_pass = await bcrypt.hash(req.body['password'], SALT_ROUNDS)
    // console.log(hash_pass);
    const { data, error } = await supabase.auth.signUp({
        email: req.body['email'],
        password: req.body['password'],
        options: {
            data: {
                username: req.body['username']
            }
        } 
    });

    if (error) {
        return res.status(400).render('register.ejs', {succes: false, error: error.message});
    } else {
        res.render('groups.ejs');
    }
})

//API Endpoints
app.post('/addEvent', async (req, res) => {

    console.log(req.body);

    const { data, error } = await supabase
    .from('CalendarEvents')
    .insert([
        {
            title: req.body['title'],
            startDate: req.body['startDate'],
            endDate: req.body['endDate'],
        }
    ])
    .select();

    console.log(data, error);
    
    if (error) {
        res.status(400).json({ succes: false, error: error.message });
    } else {
        res.json({ succes: true, data});
    }
});