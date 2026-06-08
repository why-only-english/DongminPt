const api = new GitHubAPI();

// ── Init ──────────────────────────────────────
async function init() {
  await loadWeeks();
}

// ── Data ──────────────────────────────────────
async function loadWeeks() {
  showLoading(true, '주차 목록 불러오는 중...');
  try {
    const result = await api.getJSON('docs/data/weeks.json');
    renderWeeks(result ? result.data : []);
  } catch (e) {
    showToast('불러오기 실패: ' + e.message);
  } finally {
    showLoading(false);
  }
}

async function addWeek(title) {
  showLoading(true, '주차 추가 중...');
  try {
    const result = await api.getJSON('docs/data/weeks.json');
    const weeks = result ? result.data : [];
    const sha = result ? result.sha : undefined;

    const nextId = weeks.length > 0 ? Math.max(...weeks.map(w => w.id)) + 1 : 1;
    weeks.push({ id: nextId, title, createdAt: new Date().toISOString() });

    await api.putJSON('docs/data/weeks.json', weeks, sha, `주차 추가: ${title}`);
    renderWeeks(weeks);
    showToast(`${title} 추가 완료!`);
  } catch (e) {
    showToast('추가 실패: ' + e.message);
  } finally {
    showLoading(false);
  }
}

// ── Render ────────────────────────────────────
function renderWeeks(weeks) {
  const grid = document.getElementById('weeks-grid');
  grid.innerHTML = '';

  if (weeks.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">📋</span>
        <p>아직 등록된 주차가 없습니다.<br>"주차 추가" 버튼을 눌러 첫 주차를 만들어 보세요!</p>
      </div>`;
    return;
  }

  weeks.forEach(week => {
    const card = document.createElement('div');
    card.className = 'week-card';
    card.innerHTML = `
      <div class="week-card-color"></div>
      <div class="week-card-body">
        <span class="week-badge">${week.id}주차</span>
        <h3 class="week-title">${escHtml(week.title)}</h3>
        <p class="week-date">${formatDate(week.createdAt)}</p>
      </div>`;
    card.addEventListener('click', () => {
      location.href = `week.html?id=${week.id}`;
    });
    grid.appendChild(card);
  });
}

// ── Modal ─────────────────────────────────────
function openModal(id) { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }

document.querySelectorAll('.modal-backdrop').forEach(el => {
  el.addEventListener('click', e => { if (e.target === el) el.classList.remove('active'); });
});

document.getElementById('add-week-form').addEventListener('submit', async e => {
  e.preventDefault();
  const title = document.getElementById('input-week-title').value.trim();
  if (!title) return;
  closeModal('add-week-modal');
  document.getElementById('input-week-title').value = '';
  await addWeek(title);
});

document.getElementById('btn-add-week').addEventListener('click', () => openModal('add-week-modal'));

// ── Utils ─────────────────────────────────────
function showLoading(show, msg = '처리 중...') {
  document.getElementById('loading').style.display = show ? 'flex' : 'none';
  document.getElementById('loading-msg').textContent = msg;
}

let toastTimer;
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
}

function formatDate(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

function escHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

requireAuth(init);
