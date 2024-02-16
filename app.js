const express = require("express");

const app = express();
app.use(express.json());

const { open } = require("sqlite");
const sqlite3 = require("sqlite3");

const path = require("path");
let dbPath = path.join(__dirname, "twitterClone.db");

let db = null;

const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("app listening at server 3000");
    });
  } catch (e) {
    console.log(`DB Error : ${e.message}`);
  }
};

initializeDbAndServer();

const bcrypt = require("bcrypt");

// API 1 : Registration

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const checkUser = `select * from user where username = '${username}';`;
  const user = await db.get(checkUser);
  console.log(user);

  if (user !== undefined) {
    response.status(400);
    response.send("User already exists");
    return;
  } else {
    if (password.length < 6) {
      console.log(password.length);
      response.status(400);
      response.send("Password is too short");
      return;
    } else {
      hashedPassword = await bcrypt.hash(password, 10);
      const addUser = `
            insert into user(username, password, name, gender) values(
                '${username}',
                '${hashedPassword}',
                '${name}',
                '${gender}'
            );
            `;
      try {
        await db.run(addUser);
        response.send("User created successfully");
      } catch (e) {
        console.log(`Failed to add user : ${e.message}`);
      }
    }
  }
});

// API 2 : Login

const jwt = require("jsonwebtoken");

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const checkUser = `select * from user where username ='${username}';`;
  const user = await db.get(checkUser);
  console.log(user);
  if (user === undefined) {
    response.status(400);
    response.send("Invalid user");
    return;
  } else {
    dbPassword = user.password;
    console.log(dbPassword);
    const isPasswordMatched = await bcrypt.compare(password, dbPassword);
    if (isPasswordMatched === false) {
      response.status(400);
      response.send("Invalid password");
      return;
    } else {
      const payload = user;
      const jwtToken = jwt.sign(payload, "my_token");
      response.send({ jwtToken });
    }
  }
});

// Middleware to Authenticate

const checkUserAuth = (request, response, next) => {
  const authHeader = request.headers["authorization"];
  if (authHeader === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
    return;
  } else {
    const jwtToken = authHeader.split(" ")[1];
    if (jwtToken === undefined) {
      response.status(401);
      response.send("Invalid JWT Token");
      return;
    } else {
      jwtToken.verify(jwtToken, "my_token", async (error, payload) => {
        if (error) {
          response.status(401);
          response.send("Invalid JWT Token");
          return;
        } else {
          request.userDetails = payload;
          next();
        }
      });
    }
  }
};

//
