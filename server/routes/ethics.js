const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/ethics/questions
router.get('/questions', async (req, res) => {
  try {
    const questions = await db.all('SELECT * FROM ethical_questions ORDER BY id');
    res.json(questions);
  } catch (err) {
    res.status(500).json({ error: 'db_error', message: err.message });
  }
});

// GET /api/ethics/ai-profiles
router.get('/ai-profiles', async (req, res) => {
  try {
    const profiles = await db.all('SELECT id, name, model_version, description, color_hex FROM ai_profiles ORDER BY id');
    res.json(profiles);
  } catch (err) {
    res.status(500).json({ error: 'db_error', message: err.message });
  }
});

// GET /api/ethics/ai-answers
router.get('/ai-answers', async (req, res) => {
  try {
    const answers = await db.all('SELECT ai_profile_id, question_id, answer_value FROM ai_answers');
    res.json(answers);
  } catch (err) {
    res.status(500).json({ error: 'db_error', message: err.message });
  }
});

// POST /api/ethics/submit
// Body: { session_id: string, answers: [{ question_id: number, answer_value: number }] }
router.post('/submit', async (req, res) => {
  const { session_id, user_id, answers } = req.body;
  if (!session_id || !Array.isArray(answers) || answers.length === 0) {
    return res.status(400).json({ error: 'invalid_input', message: 'session_id and answers array required.' });
  }

  try {
    // Upsert session — store user_id for deduplication across rounds
    await db.run(
      'INSERT OR IGNORE INTO user_sessions (session_id, user_id) VALUES (?, ?)',
      [session_id, user_id || null]
    );

    // Save user answers
    for (const { question_id, answer_value } of answers) {
      await db.run(
        'INSERT OR REPLACE INTO user_answers (session_id, question_id, answer_value) VALUES (?, ?, ?)',
        [session_id, question_id, answer_value]
      );
    }

    // Fetch all answers for this session to compute session-wide mindalike
    const allSessionAnswers = await db.all(
      'SELECT question_id, answer_value FROM user_answers WHERE session_id = ?',
      [session_id]
    );

    // Compute soulmate
    const result = await computeSoulmate(allSessionAnswers);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'db_error', message: err.message });
  }
});

// GET /api/ethics/stats
router.get('/stats', async (req, res) => {
  try {
    const profiles = await db.all('SELECT id, name, model_version, color_hex FROM ai_profiles ORDER BY id');
    const questions = await db.all('SELECT id, question_type FROM ethical_questions');
    const aiAnswerRows = await db.all('SELECT ai_profile_id, question_id, answer_value FROM ai_answers');
    const allUserAnswers = await db.all('SELECT session_id, question_id, answer_value FROM user_answers');

    // Count distinct users: by user_id when available, else by session_id (backwards compat)
    const countRow = await db.get(
      'SELECT COUNT(DISTINCT COALESCE(user_id, session_id)) AS total FROM user_sessions'
    );
    const totalUsers = countRow ? countRow.total : 0;

    // Map questions types
    const questionTypeMap = {};
    for (const q of questions) {
      questionTypeMap[q.id] = q.question_type;
    }

    // Map AI answers by profile_id -> question_id -> answer_value
    const aiAnswerMap = {};
    for (const row of aiAnswerRows) {
      if (!aiAnswerMap[row.ai_profile_id]) aiAnswerMap[row.ai_profile_id] = {};
      aiAnswerMap[row.ai_profile_id][row.question_id] = row.answer_value;
    }

    // Group user answers by session_id
    const userAnswersBySession = {};
    for (const row of allUserAnswers) {
      if (!userAnswersBySession[row.session_id]) userAnswersBySession[row.session_id] = {};
      userAnswersBySession[row.session_id][row.question_id] = row.answer_value;
    }

    const soulmateCounts = {};
    for (const p of profiles) soulmateCounts[p.id] = 0;

    const humanScores = {};
    for (const p of profiles) humanScores[p.id] = { total: 0, count: 0 };

    // Process each session in memory
    for (const session_id in userAnswersBySession) {
      const userMap = userAnswersBySession[session_id];
      const userQids = Object.keys(userMap);
      if (userQids.length === 0) continue;

      // Compute scores for each profile
      const scores = [];
      for (const profile of profiles) {
        const aiMap = aiAnswerMap[profile.id] || {};
        const commonQuestions = userQids.filter(qid => aiMap[qid] !== undefined);
        if (commonQuestions.length === 0) {
          scores.push({ id: profile.id, match_pct: 0 });
          continue;
        }

        let totalSim = 0;
        for (const qid of commonQuestions) {
          const qType = questionTypeMap[qid];
          const u = userMap[qid];
          const a = aiMap[qid];

          if (qType === 'scale') {
            totalSim += 1 - Math.abs(u - a) / 4;
          } else {
            totalSim += u === a ? 1 : 0;
          }
        }

        scores.push({
          id: profile.id,
          match_pct: Math.round((totalSim / commonQuestions.length) * 100)
        });
      }

      // Find soulmate (highest score)
      scores.sort((a, b) => b.match_pct - a.match_pct);
      const soulmate = scores[0];
      if (soulmate && soulmate.match_pct > 0) {
        soulmateCounts[soulmate.id] = (soulmateCounts[soulmate.id] || 0) + 1;
      }

      // Add to humanScores
      for (const s of scores) {
        humanScores[s.id].total += s.match_pct;
        humanScores[s.id].count += 1;
      }
    }

    const distribution = profiles.map(p => ({
      id: p.id,
      name: p.name,
      model_version: p.model_version,
      color_hex: p.color_hex,
      soulmate_count: soulmateCounts[p.id] || 0,
      soulmate_pct: totalUsers > 0 ? Math.round((soulmateCounts[p.id] || 0) / totalUsers * 100) : 0,
      avg_human_match: humanScores[p.id].count > 0
        ? Math.round(humanScores[p.id].total / humanScores[p.id].count)
        : null
    })).sort((a, b) => (b.avg_human_match || 0) - (a.avg_human_match || 0));

    res.json({ total_users: totalUsers, distribution });
  } catch (err) {
    res.status(500).json({ error: 'db_error', message: err.message });
  }
});

// Helper: compute soulmate from a user answers array
async function computeSoulmate(userAnswers) {
  const questions = await db.all('SELECT id, question_type FROM ethical_questions');
  const questionTypeMap = {};
  for (const q of questions) questionTypeMap[q.id] = q.question_type;

  const profiles = await db.all('SELECT id, name, model_version, description, color_hex FROM ai_profiles ORDER BY id');
  const aiAnswerRows = await db.all('SELECT ai_profile_id, question_id, answer_value FROM ai_answers');

  // Group AI answers by profile
  const aiAnswerMap = {};
  for (const row of aiAnswerRows) {
    if (!aiAnswerMap[row.ai_profile_id]) aiAnswerMap[row.ai_profile_id] = {};
    aiAnswerMap[row.ai_profile_id][row.question_id] = row.answer_value;
  }

  // Build user answer map
  const userMap = {};
  for (const { question_id, answer_value } of userAnswers) {
    userMap[question_id] = answer_value;
  }

  const scores = profiles.map(profile => {
    const aiMap = aiAnswerMap[profile.id] || {};
    const commonQuestions = Object.keys(userMap).filter(qid => aiMap[qid] !== undefined);
    if (commonQuestions.length === 0) return { ...profile, match_pct: 0 };

    let totalSim = 0;
    for (const qid of commonQuestions) {
      const qType = questionTypeMap[qid];
      const u = userMap[qid];
      const a = aiMap[qid];

      if (qType === 'scale') {
        // Normalized distance: 1 - |u-a|/(5-1)
        totalSim += 1 - Math.abs(u - a) / 4;
      } else {
        // Categorical: exact match
        totalSim += u === a ? 1 : 0;
      }
    }

    return {
      ...profile,
      match_pct: Math.round((totalSim / commonQuestions.length) * 100)
    };
  });

  scores.sort((a, b) => b.match_pct - a.match_pct);
  return {
    soulmate: scores[0] || null,
    all_scores: scores
  };
}

module.exports = router;
