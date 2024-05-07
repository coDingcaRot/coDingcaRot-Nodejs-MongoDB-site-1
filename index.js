require('dotenv').config(); // process .env files
const express = require('express'); //basic funx
const session = require('express-session'); //cookies
const Joi = require('joi'); //input validations
const bcrypt = require('bcrypt'); //pw hasing
const saltRounds = 12;
const app = express();
const port = process.env.PORT || 3000; //ports
const expireTime = 1*60*60*1000 // expires after a day



app.use(express.urlencoded({extended: false})); // req.body usage

/*** MONGO SETUP ***/
const {MongoClient} = require('mongodb');
const MongoStore = require('connect-mongo');
const mongodb_user = process.env.MONGODB_USER;
const mongodb_password = process.env.MONGODB_PASSWORD;
const mongodb_host = process.env.MONGODB_HOST;
const mongodb_session_secret = process.env.MONGODB_SESSION_SECRET;
const mongodb_database = process.env.MONGODB_DATABASE;
const mongodb_connect_string = process.env.MONGODB_CONNECTION_STRING;

// var {database} = include('databaseConnection') ?

var mongoStore = MongoStore.create({
    mongoUrl: `mongodb+srv://${mongodb_user}:${mongodb_password}@${mongodb_host}/assignment1`,
    crypto:{
        secret: mongodb_session_secret
    }
})

const client = new MongoClient(mongodb_connect_string); // uri is the connection string

async function main(){
    try{
        client.connect();
    }catch (e){
        console.log(e);
    }finally{
        client.close();
    }
}
main().catch(console.error);
const userCollection = client.db(mongodb_database).collection('Users');

//Creates a session
const node_session_secret = process.env.NODE_SESSION_SECRET;
app.use(session({
    secret: node_session_secret,
    store: mongoStore, //default is memory store
    saveUninitialized: false,
    resave: true
})
);


/*** MONGO FUNCTIONS ***/

async function createUser(client, newUser){
    await client.db(mongodb_database).collection(process.env.MONGODB_C1).insertOne(newUser);
}

async function createSession(client, newSession){
    await client.db(mongodb_database).collection(process.env.MONGODB_C2).insertOne(newSession);
}

// async function findData(client, collection, data){
//     const result = await client.db(mongodb_database).collection(collection);
    
//     return result;
// }

/*** INITIAL PAGE ***/
app.get('/', (req, res) =>{
    var html = 
    `
    <form action='signUp' method='get'>
        <button>Sign Up</button>
    </form>
    <form action='/login' method='get'>
        <button>Login</button>
    </form>
    `;

    res.send(html)
});


//sign up page
app.get('/signUp', (req, res) =>{
    var html=

    `
    Fill in the Following fields
    <form action='/signUpSubmit' method='post'>
        <input name='name' type='text' placeholder='name'>
        <input name='email' type='text' placeholder='email'>
        <input name='password' type='password' placeholder='password'>
        <button>Submit</button>
    </form>
    `;
    res.send(html);
})

app.post('/signUpSubmit', (req, res) =>{
    var name = req.body.name;
    var email = req.body.email;
    var password = req.body.password;

    var backLinkHtml = 
    `
    <a href='/signUp'>Try again</a>
    `;

    const schema = Joi.object({
        name: Joi.string().alphanum().max(20).required().messages({
            'string.empty': 'Name is Required',
        }),
        email: Joi.string().max(50).required().messages({
            'string.empty': 'Email is Required',
        }),
        password: Joi.string().max(20).required().messages({
            'string.empty': 'Password is Required',
        })
    });

    const validateResult = schema.validate({name, email, password})
    if(validateResult.error != null){
        const errors = validateResult.error.details.map(err => err.message) //extracts messages from schema
        const errorHtml = errors.map(err=> `<p>${err}<p>`).join(''); // maps it into its html form
        var html = `${errorHtml}${backLinkHtml}` //create html format
        res.send(html);
        return;
    }

    var hashedPassword = bcrypt.hashSync(password, saltRounds);

    //add user to db and add create a session
    createUser(client, {username: name, password: hashedPassword, email: email});
    createSession(client, {
        Expiretime: req.session.cookie.maxAge=expireTime,
        Session: req.session.username=name,
        authenticated: req.session.authenticated=true
    })

    //random num
    var num = Math.floor(Math.random() * 3 + 1)
    res.redirect(`/members/${num}`);
});

//login page
app.get('/login', (req, res) => {
    var html = 
    `
        Log in
        <form action='/loggingin' method='post'>
            <input name='email' type='email' placeholder='email'>
            <input name='password' type='password' placeholder='password'>
            <button>Submit</button>
        </form>
    `;
    res.send(html);
})

app.post('/loggingin', async (req, res) =>{
    var email = req.body.email;
    var password = req.body.password;

    const schema = Joi.object({
        email: Joi.string().max(50).required(),
        password: Joi.string().max(20).required()
    });
    const validateResult = schema.validate({email, password});
    if(validateResult.error != null){
        res.redirect('/login')
        return;
    }

    //find an email and password that matches with req.bodies and matches correct id
    const result = await userCollection.find({email: email}).project({email: 1, username: 1, password: 1, _id: 1}).toArray();
    // console.log(result)

    //Look for user
    if(result.length != 1){
        // console.log("Email not found");
        res.redirect("/login");
        return
    }
    //compare password match
    if(await bcrypt.compare(password, result[0].password)){
        // console.log("Matching password");
        req.session.authenticated = true;
        req.session.username = result[0].username;
        req.session.cookie.maxAge = expireTime;

        res.redirect('/loggedin');
        return;
    }
    else {
        var html =
        `
        <p>Invalid email/password combination.</p>
        <a href='/login'>Try again</a>
        `;
        res.send(html);
    }


});


app.get('/loggedin', (req, res) =>{
    if(!req.session.authenticated){
        res.redirect('/');
        return;
    }

    var num = Math.floor(Math.random() * 3 + 1)
    var name = req.session.username;
    var html = 
    `
    Hello ${name}
    <form action='/members/${num}' method='get'>
        <button>Go to members area</button>
    </form>

    <form action='logout' method='get'>
        <button>Logout</button>
    </form>
    `;

    res.send(html);
});

//Members page
app.get('/members/:picture', (req, res) =>{
    // var collection = getCollection(client, "Users");
    // var name = collection.find();
    if(!req.session.authenticated){
        res.redirect('/');
        return;
    }

    var picture = req.params.picture;
    var gif;
    if(picture ==1){
        gif ="<img src='/Ric-And-Morty-Aesthetic-Rainbow-drive.gif' style='width:500px'>";
    }else if (picture == 2){
        gif="<img src='/cool-morty-and-rigby.gif' style='width:500px'>"
    }else if (picture == 3){
        gif="<img src='/happy-jake.gif' style='width:500px'>"
    }else {
        res.send("Invalid picture: " + picture)
    }

    var name = req.session.username;
    res.send(
        `<h1>Welcome, ${name}.</h1>
        ${gif}
        <form action='/logout' method='get'>
            <button> logout </button>
        </form>
        `
    );
})

//Logout page
app.get('/logout', async (req, res) =>{
    req.session.destroy();
    res.redirect('/');
})

app.use(express.static(__dirname + "/public"));

/*** IF PAGE DOESNT EXIST ***/
app.get('*', (req, res) =>{
    res.status(404);

    var html = 
    `
        <h1 style ="display: flex;
                    text-align: center;
                    align-items: center; 
                    justify-content: center; 
                    margins: auto;
                    height: 23em;
                    width: 50em;">
            Page not found 404
        </h1>
    `;

    res.send(html);
});


app.listen(port, ()=>{
    console.log(`Server is running on port ${port}`);
});