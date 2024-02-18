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
      jwt.verify(jwtToken, "my_token", async (error, payload) => {
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

// AP1 3 : tweets feed
// Returns the latest tweets of people whom the user follows. Return 4 tweets at a time

app.get("/user/tweets/feed/", checkUserAuth, async (request, response) => {
  const { user_id } = request.userDetails;
  console.log(user_id);
  const getUserFeed = `
    select u.username, t.tweet, t.date_time as dateTime
    from tweet t, user u where t.user_id = u.user_id and
    t.user_id in (
        select f.following_user_id from follower f
        where f.follower_user_id = ${user_id}
    )
    order by t.date_time
    limit 4
    `;
  const userFeed = await db.all(getUserFeed);
  response.send(userFeed);
});

// API 4 : User Following
// Returns the list of all names of people whom the user follows

app.get("/user/following/", checkUserAuth, async (request, response) => {
  const { user_id } = request.userDetails;
  console.log(user_id);
  const getFollowingMembers = `select u.name from user u, follower f
    where u.user_id = f.following_user_id and f.follower_user_id = ${user_id}`;
  const userFollowing = await db.all(getFollowingMembers);
  response.send(userFollowing);
});

// API 5 : User Followers
// Returns the list of all names of people who follows the user

app.get("/user/followers/", checkUserAuth, async (request, response) => {
  const { user_id } = request.userDetails;
  console.log(user_id);
  const getFollowerMembers = `select u.name from user u, follower f
    where u.user_id = f.follower_user_id and f.following_user_id = ${user_id}`;
  const userFollowers = await db.all(getFollowerMembers);
  response.send(userFollowers);
});

// API 6 : tweets
// If the user requests a tweet of the user he is following, return the tweet, likes count, replies count and date-time

app.get("/tweets/:tweetId/", checkUserAuth, async (request, response) => {
  const { tweetId } = request.params;
  const { user_id } = request.userDetails;
  console.log(tweetId, user_id);

  const getTweet = `select * from tweet t, follower f where t.user_id = f.following_user_id
    and f.follower_user_id = ${user_id} and t.tweet_id = ${tweetId};`;

  const reqTweet = await db.get(getTweet);
  if (reqTweet === undefined) {
    response.status(401);
    response.send("Invalid Request");
    return;
  } else {
    const getLikeCount = `select count(l.like_id) as likes
        from like l
        where l.tweet_id = ${tweetId}
        group by l.tweet_id;`;

    const numLikeTweets = await db.get(getLikeCount);

    const getReplyCount = `select count(r.reply_id) as replies
    from reply r 
    where r.tweet_id = ${tweetId}
    group by r.tweet_id;`;

    const numReplyTweets = await db.get(getReplyCount);

    response.send({
      tweet: reqTweet.tweet,
      likes: numLikeTweets.likes,
      replies: numReplyTweets.replies,
      dateTime: reqTweet.date_time,
    });
  }
});

// API 7 : Tweet liked by -
// If the user requests a tweet of a user he is following, return the list of usernames who liked the tweet

app.get("/tweets/:tweetId/likes/", checkUserAuth, async (request, response) => {
  const { tweetId } = request.params;
  const { user_id } = request.userDetails;
  console.log(tweetId, user_id);

  const getTweet = `select * from tweet t, follower f where t.user_id = f.following_user_id
    and f.follower_user_id = ${user_id} and t.tweet_id = ${tweetId};`;
  const reqTweet = await db.get(getTweet);
  if (reqTweet === undefined) {
    response.status(401);
    response.send("Invalid Request");
    return;
  } else {
    const getTweetLiked = `select u.name as name from user u, like l
        where l.user_id = u.user_id and l.tweet_id = ${tweetId};`;
    const liked = [];
    const likedNames = await db.all(getTweetLiked);
    likedNames.forEach((name) => {
      liked.push(name.name);
    });
    response.send({
      likes: liked,
    });
  }
});

// API 8 : tweet replies
// If the user requests a tweet of a user he is following, return the list of replies.

app.get(
  "/tweets/:tweetId/replies/",
  checkUserAuth,
  async (request, response) => {
    const { tweetId } = request.params;
    const { user_id } = request.userDetails;
    console.log(tweetId, user_id);

    const getTweet = `select * from tweet t, follower f where t.user_id = f.following_user_id
    and f.follower_user_id = ${user_id} and t.tweet_id = ${tweetId};`;
    const reqTweet = await db.get(getTweet);

    if (reqTweet === undefined) {
      response.status(401);
      response.send("Invalid Request");
      return;
    } else {
      const getTweetReplied = `select u.name as name, r.reply as reply from user u, reply r
        where r.user_id = u.user_id and r.tweet_id = ${tweetId};`;
      const replied = [];
      const repliedNames = await db.all(getTweetReplied);
      repliedNames.forEach((reply) => {
        replied.push(reply);
      });
      response.send({
        replies: replied,
      });
    }
  }
);

// API 9 : User tweets
// Returns a list of all tweets of the user

app.get("/user/tweets/", checkUserAuth, async (request, response) => {
  const { user_id } = request.userDetails;
  console.log(user_id);
  const getTweets = `
  SELECT
    t.tweet,
    COUNT(DISTINCT CASE WHEN l.like_id IS NOT NULL THEN l.like_id END) AS likes,
    COUNT(DISTINCT CASE WHEN r.reply_id IS NOT NULL THEN r.reply_id END) AS replies
FROM
    (tweet t
    LEFT JOIN like l ON t.tweet_id = l.tweet_id)
    LEFT JOIN reply r ON t.tweet_id = r.tweet_id
WHERE
    t.user_id = ${user_id}
GROUP BY
    t.tweet;
`;

  const userTweetsInfo = await db.all(getTweets);
  response.send(userTweetsInfo);
});
