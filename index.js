import express from "express";
import axios from "axios";
import cors from "cors";
import dotenv from "dotenv";
import { Redis } from "@upstash/redis";

dotenv.config();


const whitelist = ["http://localhost:5173", "https://saish.tech"]

const app = express();
const corsOptions = {
    origin : function (origin, callback){
        if(!origin || whitelist.indexOf(origin) != -1){
            callback(null, true)
        }
        else{
            console.log("Blocked by CORS:", origin);
            callback(new Error('Not Allowed By Cors'))
        }
    }
}

app.use(cors(corsOptions));

app.use(cors());
app.use(express.json());

const START_DATE = "2026-01-01";

const URL = process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const username = "saishmungase";

const redis = new Redis({
  url : URL,
  token : TOKEN
})

app.get("/github", async (req, res) => {

  try{
    const data = await redis.get("github");
    if(!data || data.length < 1){
      throw Error("No Github Data Found!")
    }
    res.json(data);
    console.log("GITHUB:- Response from the API")
    return;
  }
  catch(e){
    console.log(e.message || e);
  }

  try {
    const query = `
      query($username: String!) {
        user(login: $username) {
          contributionsCollection(
            from: "${START_DATE}T00:00:00Z"
            to: "${new Date().toISOString()}"
          ) {
            contributionCalendar {
              weeks {
                contributionDays {
                  date
                  contributionCount
                }
              }
            }
          }
        }
      }
    `;

    const response = await axios.post(
      "https://api.github.com/graphql",
      {
        query,
        variables: { username: username },
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        },
      }
    );

    const weeks =
      response.data.data.user.contributionsCollection
        .contributionCalendar.weeks;

    const data = [];
    weeks.forEach((week) => {
      week.contributionDays.forEach((day) => {
        data.push({
          date: day.date,
          count: day.contributionCount,
        });
      });
    });

    res.json(data);
    console.log("GITHUB:- Response from the API")
    await redis.set("github", JSON.stringify(data), {
      EX : 600
    })

  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Failed to fetch GitHub data" });
  }
});

app.get("/leetcode", async (req, res) => {

  try{
    const data = await redis.get("leetcode");
    if(!data) throw Error("No LeetCode Data Found!")
    res.json(data);
    console.log("LEETCODE:- Response From Redis")
    return;
  }
  catch(e){
    console.log(e.message || e);
  }

  try {
    const query = `
      query($username: String!) {
        recentAcSubmissionList(username: $username, limit: 1000) {
          timestamp
          statusDisplay
        }
      }
    `;

    const response = await axios.post(
      "https://leetcode.com/graphql",
      {
        query,
        variables: { username: username },
      },
      { headers: { "Content-Type": "application/json" } }
    );

    const submissions = response.data.data.recentAcSubmissionList;

    const start = new Date(START_DATE);
    const today = new Date();

    const map = {};

    submissions.forEach((sub) => {
      if (sub.statusDisplay !== "Accepted") return;

      const date = new Date(sub.timestamp * 1000)
        .toISOString()
        .split("T")[0];

      if (!map[date]) map[date] = 0;
      map[date]++;
    });

    const result = [];
    for (let d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split("T")[0];
      result.push({
        date: dateStr,
        count: map[dateStr] || 0,
      });
    }

    res.json(result);
    console.log("LEETCODE:- Response From API")
    await redis.set("leetcode", JSON.stringify(result), {
      EX : 600
    })
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Failed to fetch LeetCode data" });
  }
});

app.get("/dsa", async (req, res) => {

  try {
    const data = await redis.get("dsa");
    if(!data) throw Error("No DSA profile found in cache");

    if(!data.leetcode.solvedJson || !data.leetcode.profileJson) throw Error("No DSA profile found in cache for Leetcode")

    if(!data.codeforce.cfJson || !data.codeforce.historyJson) throw Error("No DSA profile found in cache for Codeforces");
    
    if(!data.codechef.ccJson) throw Error("No DSA profile found in cache for CodeChef");

    res.json(data);
    console.log("DSA:- Response from the Redis")
    return;
  } catch (error) {
    console.log(error.message || error);
  } 

  let data = {
    leetcode : {
    },
    codeforce : {
    },
    codechef : {
    }
  };  

  try {
    const solvedRes = await fetch(`https://alfa-leetcode-api.onrender.com/${username}/solved`);
    const solvedJson = await solvedRes.json();
    const profileRes = await fetch(`https://alfa-leetcode-api.onrender.com/${username}`);
    const profileJson = await profileRes.json();
    data.leetcode.profileJson = profileJson;
    data.leetcode.solvedJson = solvedJson;
  } catch (e) {
    console.warn("LeetCode API failed" + e);
  } 

  try {
    const cfRes = await fetch(`https://codeforces.com/api/user.info?handles=${username}`);
    const cfJson = await cfRes.json();
    const historyRes = await fetch(`https://codeforces.com/api/user.rating?handle=${username}`);
    const historyJson = await historyRes.json();
    data.codeforce.cfJson = cfJson;
    data.codeforce.historyJson = historyJson;
  } catch (e) { 
      console.warn("Codeforces API failed"); 
  }

  try {
      const ccRes = await fetch(`https://competeapi.vercel.app/user/codechef/${username}`);
      const ccJson = await ccRes.json();
      data.codechef.ccJson = ccJson;
  } catch (e) {
      console.warn("CodeChef API failed");
  }

  res.json(data);
  console.log("DSA:- Response from the API")
  await redis.set("dsa", JSON.stringify(data), {
    EX : 600
  })

})

const PORT = 5000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
