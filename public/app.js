const dailyNoteEl = document.getElementById('dailyNote');
const refreshQuoteEl = document.getElementById('refreshQuote');
const helplineListEl = document.getElementById('helplineList');
const therapistSelect = document.getElementById('therapistSelect');

const bookingForm = document.getElementById('bookingForm');
const bookingResult = document.getElementById('bookingResult');
const chatForm = document.getElementById('chatForm');
const chatMessages = document.getElementById('chatMessages');
const testForm = document.getElementById('testForm');
const testResult = document.getElementById('testResult');
const timerDisplay = document.getElementById('timerDisplay');
const stopMeditation = document.getElementById('stopMeditation');

let timerInterval = null;
let currentAudioCtx = null;

function addMessage(text, klass) {
  const p = document.createElement('p');
  p.className = `msg ${klass}`;
  p.textContent = text;
  chatMessages.appendChild(p);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

async function loadConfig() {
  const res = await fetch('/api/config');
  const config = await res.json();
  dailyNoteEl.textContent = config.dailyNote;
  refreshQuoteEl.textContent = `“${config.quote}”`;

  helplineListEl.innerHTML = '';
  config.helplines.forEach((item) => {
    const li = document.createElement('li');
    li.textContent = `${item.country}: ${item.number}`;
    helplineListEl.appendChild(li);
  });

  therapistSelect.innerHTML = '';
  config.therapists.forEach((t) => {
    const option = document.createElement('option');
    option.value = t.name;
    option.textContent = `${t.name} — ${t.specialization} (${t.availability})`;
    therapistSelect.appendChild(option);
  });

  addMessage('Hi, I am your calm support bot. I am here to listen and guide you gently.', 'bot');
}

bookingForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(bookingForm).entries());
  const res = await fetch('/api/book-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  const result = await res.json();
  if (!res.ok) {
    bookingResult.textContent = result.error;
    return;
  }
  bookingResult.textContent = `Booked! Join link (${data.sessionType}): ${result.joinLink}`;
  bookingForm.reset();
});

chatForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = new FormData(chatForm);
  const message = form.get('message');
  addMessage(`You: ${message}`, 'user');
  chatForm.reset();

  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message })
  });
  const data = await res.json();
  addMessage(`Bot: ${data.reply}`, 'bot');
});

function stopRelaxingTone() {
  if (currentAudioCtx) {
    currentAudioCtx.close();
    currentAudioCtx = null;
  }
}

function playRelaxingTone() {
  stopRelaxingTone();
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = 174;
  gain.gain.value = 0.03;
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  currentAudioCtx = ctx;
}

function startTimer(minutes) {
  playRelaxingTone();
  let remaining = minutes * 60;
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    const mm = String(Math.floor(remaining / 60)).padStart(2, '0');
    const ss = String(remaining % 60).padStart(2, '0');
    timerDisplay.textContent = `Meditation in progress: ${mm}:${ss}`;
    remaining -= 1;
    if (remaining < 0) {
      clearInterval(timerInterval);
      timerDisplay.textContent = 'Session complete. You did great. 🌿';
      stopRelaxingTone();
    }
  }, 1000);
}

document.querySelectorAll('[data-min]').forEach((btn) => {
  btn.addEventListener('click', () => startTimer(Number(btn.dataset.min)));
});

stopMeditation.addEventListener('click', () => {
  clearInterval(timerInterval);
  timerDisplay.textContent = 'Meditation stopped. Take a gentle breath.';
  stopRelaxingTone();
});

testForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const formData = Object.fromEntries(new FormData(testForm).entries());
  const payload = {
    studentName: formData.studentName,
    email: formData.email,
    answers: {
      stressLevel: Number(formData.stressLevel),
      sleepQuality: Number(formData.sleepQuality),
      supportLevel: Number(formData.supportLevel),
      moodStability: Number(formData.moodStability),
      focusLevel: Number(formData.focusLevel)
    }
  };

  const res = await fetch('/api/mental-test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!res.ok) {
    testResult.textContent = data.error;
    return;
  }

  testResult.textContent = `Wellness state: ${data.wellnessState}. Guidance: ${data.guidance}`;
  testForm.reset();
});

function init3DBackground() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
  const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('scene'), alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);

  const geometry = new THREE.IcosahedronGeometry(1.7, 1);
  const material = new THREE.MeshStandardMaterial({
    color: 0x7ee7ff,
    wireframe: true,
    transparent: true,
    opacity: 0.35
  });

  const orb = new THREE.Mesh(geometry, material);
  scene.add(orb);
  const light = new THREE.PointLight(0xaaffff, 1.2);
  light.position.set(4, 5, 8);
  scene.add(light);
  camera.position.z = 5;

  function animate() {
    requestAnimationFrame(animate);
    orb.rotation.x += 0.002;
    orb.rotation.y += 0.003;
    renderer.render(scene, camera);
  }

  animate();
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

loadConfig();
init3DBackground();
