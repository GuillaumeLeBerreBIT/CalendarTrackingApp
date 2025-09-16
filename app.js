import express from "express";
import path from "path";
import { fileURLToPath } from 'url';
import ejs from "ejs";
import bodyParser from "body-parser";
import cors from "cors";
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const supabaseKey = process.env.SUPABASE_KEY
const supabase = createClient(
    'https://fhaffbgrrepbowirthcb.supabase.co', 
    supabaseKey
);

app.use(bodyParser.urlencoded({extended: true}));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(cors());

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