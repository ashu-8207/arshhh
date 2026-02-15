const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'wellness.db');
const PUBLIC_DIR = path.join(__dirname, 'public');

function runSql(sql) {
  return execFileSync('sqlite3', [DB_PATH, sql], { encoding: 'utf8' });
}

function escapeSql(value) {
  return `'${String(value ?? '').replaceAll("'", "''")}'`;
}

runSql(`
CREATE TABLE IF NOT EXISTS session_bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_name TEXT NOT NULL,
  email TEXT NOT NULL,
  therapist TEXT NOT NULL,
  session_type TEXT NOT NULL,
  slot_time TEXT NOT NULL,
  notes TEXT,
  join_link TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS mental_test_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_name TEXT NOT NULL,
  email TEXT,
  stress_level INTEGER NOT NULL,
  sleep_quality INTEGER NOT NULL,
  support_level INTEGER NOT NULL,
  mood_stability INTEGER NOT NULL,
  focus_level INTEGER NOT NULL,
  average_score REAL NOT NULL,
  wellness_state TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS chatbot_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`);

const dailyNotes = [
  'You are not a burden. You are a human being deserving of rest, support, and care.',
  'Small steps count. Drinking water, breathing slowly, and showing up today is progress.',
  'Asking for help is courage in motion. You do not have to carry everything alone.',
  'Your story is still unfolding. Today can be gentle and enough.',
  'You matter deeply, even on the days your mind tries to convince you otherwise.'
];
const refreshQuotes = [
  'Breathe in calm, breathe out heaviness.',
  'This moment is hard, but you are still here—and that is brave.',
  'You are allowed to pause. Healing is not a race.',
  'Clouds pass. Thoughts pass. You can stay with your breath.',
  'You are worthy of help, kindness, and one more sunrise.'
];
const therapists = [
  { name: 'Dr. Aisha Rahman', specialization: 'Student anxiety & panic support', availability: '24/7 emergency + regular slots' },
  { name: 'Dr. Ethan Miles', specialization: 'Depression and stress recovery', availability: '09:00 - 22:00' },
  { name: 'Dr. Kavya Menon', specialization: 'Crisis counseling and trauma-informed care', availability: '24/7 emergency rotation' }
];

function getDailyNote() {
  const dayNumber = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
  return dailyNotes[dayNumber % dailyNotes.length];
}

function randomQuote() {
  return refreshQuotes[Math.floor(Math.random() * refreshQuotes.length)];
}

function scoreToState(score) {
  if (score >= 4.2) return 'Thriving and stable';
  if (score >= 3.4) return 'Doing okay with manageable stress';
  if (score >= 2.6) return 'Needs gentle support and recharge';
  return 'Needs urgent support and human connection';
}

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1e6) reject(new Error('Body too large'));
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
  });
}

async function getChatReply(message) {
  const fallback = 'I hear you. I am here with you right now. Try this with me: inhale for 4, hold for 4, exhale for 6. If you are in immediate danger or might harm yourself, please call a 24/7 helpline or emergency services now. You deserve immediate human support.';
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return fallback;

  try {
    const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a compassionate mental wellness support assistant for students. Be warm, non-judgmental, concise, and safety-oriented. Encourage immediate helpline contact if user mentions self-harm intent.'
          },
          { role: 'user', content: message }
        ],
        temperature: 0.6,
        max_tokens: 220
      })
    });

    if (!aiResponse.ok) return fallback;
    const data = await aiResponse.json();
    return data.choices?.[0]?.message?.content?.trim() || fallback;
  } catch {
    return fallback;
  }
}

function serveStatic(req, res) {
  let reqPath = req.url === '/' ? '/index.html' : req.url;
  reqPath = reqPath.split('?')[0];
  const filePath = path.join(PUBLIC_DIR, reqPath);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath);
    const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript' };
    res.writeHead(200, { 'Content-Type': types[ext] || 'text/plain' });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url.startsWith('/api/config')) {
    return sendJson(res, 200, {
      dailyNote: getDailyNote(),
      quote: randomQuote(),
      therapists,
      helplines: [
        { country: 'India', number: '1800-599-0019 (Kiran 24/7)' },
        { country: 'USA & Canada', number: '988 (Suicide & Crisis Lifeline 24/7)' },
        { country: 'UK & ROI', number: '116 123 (Samaritans 24/7)' },
        { country: 'Emergency', number: 'Call local emergency services immediately' }
      ]
    });
  }

  if (req.method === 'POST' && req.url === '/api/book-session') {
    try {
      const { studentName, email, therapist, sessionType, slotTime, notes } = await parseBody(req);
      if (!studentName || !email || !therapist || !sessionType || !slotTime) {
        return sendJson(res, 400, { error: 'Please fill in all required booking fields.' });
      }
      const joinLinkToken = Buffer.from(`${studentName}-${Date.now()}`).toString('base64url').slice(0, 12);
      const joinLink = `https://mindful-campus.local/join/${joinLinkToken}`;
      runSql(`INSERT INTO session_bookings (student_name, email, therapist, session_type, slot_time, notes, join_link)
        VALUES (${escapeSql(studentName)}, ${escapeSql(email)}, ${escapeSql(therapist)}, ${escapeSql(sessionType)}, ${escapeSql(slotTime)}, ${escapeSql(notes || '')}, ${escapeSql(joinLink)});`);
      const bookingId = runSql('SELECT id FROM session_bookings ORDER BY id DESC LIMIT 1;').trim();
      return sendJson(res, 201, { success: true, bookingId, joinLink, message: 'Session booked. Keep this join link for your call.' });
    } catch (error) {
      return sendJson(res, 400, { error: error.message });
    }
  }

  if (req.method === 'POST' && req.url === '/api/mental-test') {
    try {
      const { studentName, email, answers } = await parseBody(req);
      if (!studentName || !answers) return sendJson(res, 400, { error: 'Name and answers are required.' });
      const keys = ['stressLevel', 'sleepQuality', 'supportLevel', 'moodStability', 'focusLevel'];
      const missing = keys.find((key) => typeof answers[key] !== 'number' || answers[key] < 1 || answers[key] > 5);
      if (missing) return sendJson(res, 400, { error: `Invalid score for ${missing}` });

      const score = keys.reduce((acc, key) => acc + answers[key], 0) / keys.length;
      const wellnessState = scoreToState(score);
      runSql(`INSERT INTO mental_test_results (student_name, email, stress_level, sleep_quality, support_level, mood_stability, focus_level, average_score, wellness_state)
        VALUES (${escapeSql(studentName)}, ${escapeSql(email || '')}, ${answers.stressLevel}, ${answers.sleepQuality}, ${answers.supportLevel}, ${answers.moodStability}, ${answers.focusLevel}, ${score}, ${escapeSql(wellnessState)});`);

      return sendJson(res, 200, {
        success: true,
        averageScore: Number(score.toFixed(2)),
        wellnessState,
        guidance: 'Thank you for checking in. Your feelings are valid. Consider connecting with a therapist today for personalized support.'
      });
    } catch (error) {
      return sendJson(res, 400, { error: error.message });
    }
  }

  if (req.method === 'POST' && req.url === '/api/chat') {
    try {
      const { message } = await parseBody(req);
      if (!message || typeof message !== 'string') return sendJson(res, 400, { error: 'Message is required.' });
      runSql(`INSERT INTO chatbot_messages (role, message) VALUES ('user', ${escapeSql(message)});`);
      const reply = await getChatReply(message);
      runSql(`INSERT INTO chatbot_messages (role, message) VALUES ('assistant', ${escapeSql(reply)});`);
      return sendJson(res, 200, { reply });
    } catch (error) {
      return sendJson(res, 400, { error: error.message });
    }
  }

  if (req.method === 'GET' && req.url.startsWith('/api/history')) {
    const bookings = runSql("SELECT json_group_array(json_object('id', id, 'student_name', student_name, 'email', email, 'therapist', therapist, 'session_type', session_type, 'slot_time', slot_time, 'join_link', join_link, 'created_at', created_at)) FROM (SELECT * FROM session_bookings ORDER BY created_at DESC LIMIT 10);").trim() || '[]';
    const tests = runSql("SELECT json_group_array(json_object('id', id, 'student_name', student_name, 'email', email, 'average_score', average_score, 'wellness_state', wellness_state, 'created_at', created_at)) FROM (SELECT * FROM mental_test_results ORDER BY created_at DESC LIMIT 10);").trim() || '[]';
    return sendJson(res, 200, { bookings: JSON.parse(bookings || '[]'), tests: JSON.parse(tests || '[]') });
  }

  return serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`Mindful Campus server running on http://localhost:${PORT}`);
});
