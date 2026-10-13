const express = require("express");
const User = require("../models/User");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

// GET /api/leaderboard?duration=60&difficulty=medium&limit=20
router.get("/", async (req, res) => {
  try {
    const { duration, difficulty, limit = 20 } = req.query;

    if (duration && difficulty) {
      const users = await User.find({
        bests: { $elemMatch: { duration: Number(duration), difficulty } },
      }).lean();

      const rows = users
        .map((u) => {
          const best = u.bests.find(
            (b) => b.duration === Number(duration) && b.difficulty === difficulty
          );
          return best ? { username: u.username, wpm: best.wpm, accuracy: best.accuracy, date: best.date } : null;
        })
        .filter(Boolean)
        .sort((a, b) => b.wpm - a.wpm)
        .slice(0, Number(limit));

      return res.json({ rows });
    }

    // overall leaderboard by highest wpm ever
    const users = await User.find({ "stats.highestWpm": { $gt: 0 } })
      .sort({ "stats.highestWpm": -1 })
      .limit(Number(limit))
      .select("username stats.highestWpm stats.avgAccuracy stats.testsCompleted")
      .lean();

    res.json({
      rows: users.map((u) => ({
        username: u.username,
        wpm: u.stats.highestWpm,
        accuracy: u.stats.avgAccuracy,
        testsCompleted: u.stats.testsCompleted,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load leaderboard." });
  }
});

// POST /api/leaderboard/submit  { duration, difficulty, wpm, accuracy, rawWpm, correct, incorrect }
router.post("/submit", requireAuth, async (req, res) => {
  try {
    const { duration, difficulty, wpm, accuracy } = req.body || {};
    if (!duration || !difficulty || wpm == null || accuracy == null) {
      return res.status(400).json({ error: "duration, difficulty, wpm and accuracy are required." });
    }

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: "User not found." });

    // update rolling stats
    const s = user.stats;
    const n = s.testsCompleted;
    s.avgWpm = Math.round((s.avgWpm * n + wpm) / (n + 1));
    s.avgAccuracy = Math.round((s.avgAccuracy * n + accuracy) / (n + 1));
    s.testsCompleted = n + 1;
    s.highestWpm = Math.max(s.highestWpm, wpm);

    const idx = user.bests.findIndex((b) => b.duration === duration && b.difficulty === difficulty);
    let isNewBest = false;
    if (idx === -1) {
      user.bests.push({ duration, difficulty, wpm, accuracy });
      isNewBest = true;
    } else if (wpm > user.bests[idx].wpm) {
      user.bests[idx] = { duration, difficulty, wpm, accuracy, date: new Date() };
      isNewBest = true;
    }

    await user.save();
    res.json({ isNewBest, user: user.toPublicJSON() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not submit score." });
  }
});

module.exports = router;
