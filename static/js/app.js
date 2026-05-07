/* ── App state ── */
const state = { text: '', primaryEmotion: '', primaryCore: '', lastChoice: 'F1' };

/* ── Step refs ── */
const steps = {
  input:    document.getElementById('step-input'),
  loading:  document.getElementById('step-loading'),
  analysis: document.getElementById('step-analysis'),
  feedback: document.getElementById('step-feedback'),
  mars:     document.getElementById('step-mars'),
  end:      document.getElementById('step-end'),
};

function showStep(name) {
  Object.values(steps).forEach(el => el.classList.remove('active'));
  steps[name].classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ── Toast ── */
let toastTimer;
function showToast(msg) {
  let t = document.querySelector('.toast');
  if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3500);
}

/* ── Analyze ── */
document.getElementById('btn-analyze').addEventListener('click', async () => {
  const text = document.getElementById('user-input').value.trim();
  if (!text) { showToast('先写点什么吧~'); return; }
  state.text = text;
  showStep('loading');
  try {
    const res  = await fetch('/api/analyze', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    const data = await res.json();
    if (!res.ok || data.error) { showStep('input'); showToast(data.error || '分析失败，请稍后再试'); return; }
    state.primaryEmotion = data.primary_emotion || '';
    state.primaryCore    = data.primary_core    || '';
    renderAnalysis(data);
    showStep('analysis');
  } catch { showStep('input'); showToast('网络错误，请检查连接'); }
});

/* ══════════════════════════════════════════════════════
   JUNTO 3-LAYER DISPLAY
══════════════════════════════════════════════════════ */
const CORES  = ['FEAR', 'ANGER', 'DISGUST', 'SADNESS', 'SURPRISE', 'JOY', 'LOVE'];
const COLORS = {
  FEAR: '#8B5CF6', ANGER: '#EF4444', DISGUST: '#10B981',
  SADNESS: '#60A5FA', SURPRISE: '#F59E0B', JOY: '#FB923C', LOVE: '#F472B6',
};
const ZH = {
  FEAR: '恐惧', ANGER: '愤怒', DISGUST: '厌恶',
  SADNESS: '悲伤', SURPRISE: '惊讶', JOY: '喜悦', LOVE: '爱',
};

function renderLayer1(wheelData, primaryCore) {
  const el = document.getElementById('layer1-pills');
  el.innerHTML = '';
  const totalScore = CORES.reduce((s, c) => s + (wheelData[c]?.score || 0), 0);

  CORES.forEach(core => {
    const score    = wheelData[core]?.score || 0;
    const pct      = totalScore > 0 ? Math.round((score / totalScore) * 100) : 0;
    const isActive = score >= 0.02;
    const isPrimary = core === primaryCore;
    const color    = COLORS[core];

    const pill = document.createElement('div');
    pill.className = `core-pill ${isActive ? 'active' : 'inactive'} ${isPrimary ? 'primary' : ''}`;
    pill.style.setProperty('--pill-color', color);
    pill.style.color = isActive ? color : 'rgba(255,255,255,0.18)';

    pill.innerHTML = `
      <span class="core-pill-name">${ZH[core]}</span>
      <span class="core-pill-score">${isActive ? pct + '%' : '—'}</span>
      ${isActive ? `<div class="core-pill-bar"><div class="core-pill-bar-fill" style="width:${pct}%;background:${color}"></div></div>` : ''}
      ${isPrimary ? '<span class="core-pill-star"></span>' : ''}
    `;
    el.appendChild(pill);
  });
}

function renderLayer2(wheelData) {
  const el = document.getElementById('layer2-groups');
  el.innerHTML = '';
  let hasAny = false;
  CORES.forEach(core => {
    const subs = wheelData[core]?.sub || [];
    if (!subs.length) return;
    hasAny = true;
    const color = COLORS[core];
    const group = document.createElement('div');
    group.className = 'sub-group';
    group.innerHTML = `
      <span class="sub-group-core" style="color:${color}">${ZH[core]}</span>
      <span class="sub-group-arrow">→</span>
      <div class="sub-pills">
        ${subs.map(s => `
          <div class="sub-pill" style="border-color:${color}55;background:${color}15;color:${color}">
            <span class="sub-pill-zh">${s.zh}</span>
            <span class="sub-pill-score">${Math.round(s.score * 100)}%</span>
          </div>`).join('')}
      </div>`;
    el.appendChild(group);
  });
  if (!hasAny) el.innerHTML = '<p style="color:var(--text-hint);font-size:0.85rem">未检测到明显的细化情绪</p>';
}

function renderLayer3(wheelData) {
  const el = document.getElementById('layer3-rows');
  el.innerHTML = '';
  const all = [];
  CORES.forEach(core => {
    (wheelData[core]?.sub || []).forEach(s => all.push({ ...s, color: COLORS[core] }));
  });
  all.sort((a, b) => b.score - a.score);
  if (!all.length) { el.innerHTML = '<p style="color:var(--text-hint);font-size:0.85rem">未检测到具体情绪</p>'; return; }
  all.forEach(item => {
    const row = document.createElement('div');
    row.className = 'fine-row';
    row.innerHTML = `
      <span class="fine-dot" style="background:${item.color}"></span>
      <span class="fine-label-en">${item.label}</span>
      <span class="fine-arrow">→</span>
      <span class="fine-label-zh" style="color:${item.color}">${item.zh}</span>
      <div class="fine-bar-track">
        <div class="fine-bar-fill" style="width:${Math.round(item.score*100)}%;background:${item.color}99"></div>
      </div>
      <span class="fine-score">${Math.round(item.score*100)}%</span>`;
    el.appendChild(row);
  });
}

function renderAnalysis(data) {
  document.getElementById('emotion-summary').textContent = data.emotion_summary || '';
  document.getElementById('emotion-trigger').textContent = data.trigger || '';

  const debugPanel = document.getElementById('debug-panel');
  if (data.translated_text) {
    document.getElementById('debug-translated').textContent = data.translated_text;
    debugPanel.style.display = 'block';
  } else {
    debugPanel.style.display = 'none';
  }

  if (data.wheel_data && data.primary_core) {
    renderLayer1(data.wheel_data, data.primary_core);
    renderLayer2(data.wheel_data);
    renderLayer3(data.wheel_data);
  }

  const labelsEl = document.getElementById('emotion-labels');
  labelsEl.innerHTML = '';
  (data.emotion_labels || []).forEach(({ label, color, score }) => {
    const tag = document.createElement('span');
    tag.className = 'emotion-tag';
    tag.innerHTML = `<span class="emotion-dot" style="background:${color}"></span>${label}<span style="opacity:0.5;font-size:0.75rem">&nbsp;${Math.round(score*100)}%</span>`;
    labelsEl.appendChild(tag);
  });
}

/* ── Choice selection ── */
document.querySelectorAll('.choice-btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    document.querySelectorAll('.choice-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    state.lastChoice = btn.dataset.choice;
    try {
      const res  = await fetch('/api/respond', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ choice: btn.dataset.choice, emotion: state.primaryEmotion, text: state.text }),
      });
      const data = await res.json();
      if (!res.ok || data.error) { showToast(data.error || '出错了'); return; }
      document.getElementById('feedback-text').textContent = data.feedback;
      showStep('feedback');
    } catch { showToast('网络错误，请重试'); }
  });
});

/* ══════════════════════════════════════════════════════
   MARS MODE
══════════════════════════════════════════════════════ */
let marsScene = null;

document.getElementById('btn-mars').addEventListener('click', async () => {
  showStep('mars');

  const statusEl  = document.getElementById('mars-status');
  const countEl   = document.getElementById('mars-count');
  const actionsEl = document.getElementById('mars-actions');
  statusEl.textContent  = '正在连接火星……';
  countEl.textContent   = '';
  actionsEl.style.display = 'none';

  /* Init / reinit Three.js scene */
  if (marsScene) { marsScene.dispose(); marsScene = null; }
  marsScene = new MarsScene('mars-canvas-wrap');
  marsScene.init();

  /* Load all existing particles (historical) */
  try {
    const res  = await fetch('/api/mars/particles');
    const data = await res.json();
    marsScene.loadParticles(data.particles || []);
    if (data.particles?.length) {
      countEl.textContent = `火星上已积累 ${data.particles.length} 个人类情绪粒子`;
    }
  } catch { /* non-fatal */ }

  /* Save new particle to backend */
  const color = COLORS[state.primaryCore] || '#aaaaaa';
  try {
    await fetch('/api/mars/launch', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ core: state.primaryCore, color, choice: state.lastChoice }),
    });
  } catch { /* non-fatal */ }

  /* Launch animation */
  statusEl.textContent = '正在发射……';
  const { behavior, promise } = marsScene.launch(color, state.lastChoice, 7);
  await promise;

  /* Settled */
  statusEl.textContent = (typeof BEHAVIOR_MSG !== 'undefined' && BEHAVIOR_MSG[behavior])
    ? BEHAVIOR_MSG[behavior]
    : '情绪粒子已抵达火星 ✦';
  try {
    const res2  = await fetch('/api/mars/particles');
    const data2 = await res2.json();
    countEl.textContent = `火星上现有 ${data2.particles.length} 个来自人类的情绪粒子`;
  } catch { /* non-fatal */ }

  actionsEl.style.display = 'flex';
});

/* Mars → continue / end */
document.getElementById('btn-mars-continue').addEventListener('click', () => {
  document.getElementById('user-input').value = '';
  document.querySelectorAll('.choice-btn').forEach(b => b.classList.remove('selected'));
  showStep('input');
});
document.getElementById('btn-mars-end').addEventListener('click', () => showStep('end'));

/* ── Standard navigation ── */
document.getElementById('btn-continue').addEventListener('click', () => {
  document.getElementById('user-input').value = '';
  document.querySelectorAll('.choice-btn').forEach(b => b.classList.remove('selected'));
  showStep('input');
});
document.getElementById('btn-end').addEventListener('click', () => showStep('end'));
document.getElementById('btn-restart').addEventListener('click', () => {
  document.getElementById('user-input').value = '';
  Object.assign(state, { text: '', primaryEmotion: '', primaryCore: '' });
  showStep('input');
});
