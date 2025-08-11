import express from "express";
import path from "path";
import { fileURLToPath } from 'url';
import ejs from "ejs";
import bodyParser from "body-parser";

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(bodyParser.urlencoded({extended: true}));
app.use(express.static(path.join(__dirname, 'public')));

app.set('port', process.env.PORT || 3000);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));


app.get('/', (req, res) => {
    res.render('index.ejs');
});

app.get('/calendar', (req, res) => {
    res.render('calendar.ejs');
});

app.post('/addEvent', (req, res) => {

    console.log(req.body);
    //Send to database

    //Show events on calendar

    res.redirect('/calendar');
});

app.listen(app.get('port'), () => {
    console.log(`Listening on port: ${app.get('port')}`)
})