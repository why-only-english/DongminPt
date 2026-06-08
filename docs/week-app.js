const api = new GitHubAPI();
const params = new URLSearchParams(location.search);
const weekId = parseInt(params.get('id'), 10);

let currentPosts = [];
let currentPostsSha = null;
let activePostId = null;

// ── Init ──────────────────────────────────────
async function init() {
  if (!api.isConfigured() || !weekId) {
    location.href = 'index.html';
    return;
  }
  await Promise.all([loadWeekTitle(), loadPosts()]);
}

// ── Data ──────────────────────────────────────
async function loadWeekTitle() {
  try {
    const result = await api.getJSON('docs/data/weeks.json');
    const weeks = result ? result.data : [];
    const week = weeks.find(w => w.id === weekId);
    if (week) {
      document.getElementById('week-title').textContent = `${week.id}주차 · ${week.title}`;
      document.title = `${week.title} | 동민PT`;
    }
  } catch (_) { /* 제목 로딩 실패는 무시 */ }
}

async function loadPosts() {
  showLoading(true, '사진 불러오는 중...');
  try {
    const result = await api.getJSON(`docs/data/week-${weekId}.json`);
    currentPosts = result ? result.data : [];
    currentPostsSha = result ? result.sha : null;
    renderPosts(currentPosts);
  } catch (e) {
    showToast('불러오기 실패: ' + e.message);
  } finally {
    showLoading(false);
  }
}

async function uploadPhoto(author, caption, file) {
  showLoading(true, '이미지 압축 중...');
  let base64;
  try {
    base64 = await compressImage(file);
  } catch (e) {
    showLoading(false);
    showToast('이미지 처리 실패: ' + e.message);
    return;
  }

  showLoading(true, 'GitHub에 업로드 중...');
  try {
    const id = genId();
    const imagePath = `docs/images/week-${weekId}/${id}.jpg`;
    await api.putImage(imagePath, base64, `사진 업로드 by ${author} (${weekId}주차)`);

    // 최신 posts 다시 읽어서 충돌 방지
    const latest = await api.getJSON(`docs/data/week-${weekId}.json`);
    const posts = latest ? latest.data : [];
    const sha = latest ? latest.sha : null;

    posts.push({
      id,
      author,
      caption,
      imagePath,
      createdAt: new Date().toISOString(),
      comments: [],
    });

    await api.putJSON(`docs/data/week-${weekId}.json`, posts, sha, `사진 추가 by ${author} (${weekId}주차)`);
    currentPosts = posts;
    currentPostsSha = null;
    renderPosts(currentPosts);
    showToast('업로드 완료!');
  } catch (e) {
    showToast('업로드 실패: ' + e.message);
  } finally {
    showLoading(false);
  }
}

async function addComment(postId, author, text) {
  showLoading(true, '댓글 등록 중...');
  try {
    const latest = await api.getJSON(`docs/data/week-${weekId}.json`);
    if (!latest) throw new Error('데이터를 찾을 수 없습니다');
    const posts = latest.data;
    const post = posts.find(p => p.id === postId);
    if (!post) throw new Error('포스트를 찾을 수 없습니다');
    post.comments.push({ id: genId(), author, text, createdAt: new Date().toISOString() });
    await api.putJSON(`docs/data/week-${weekId}.json`, posts, latest.sha, `댓글 추가 by ${author}`);
    currentPosts = posts;
    renderPosts(currentPosts);
    showToast('댓글 등록 완료!');
  } catch (e) {
    showToast('댓글 실패: ' + e.message);
  } finally {
    showLoading(false);
  }
}

// ── Render ────────────────────────────────────
function renderPosts(posts) {
  const grid = document.getElementById('posts-grid');
  grid.innerHTML = '';

  if (posts.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">📷</span>
        <p>아직 올라온 사진이 없습니다.<br>"사진 올리기" 버튼으로 첫 사진을 공유해보세요!</p>
      </div>`;
    return;
  }

  // 최신순 정렬
  const sorted = [...posts].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  sorted.forEach(post => {
    const card = document.createElement('div');
    card.className = 'post-card';
    card.innerHTML = `
      <div class="post-img-wrap">
        <img class="post-img" src="${api.rawUrl(post.imagePath)}" alt="${escHtml(post.author)}" loading="lazy" />
      </div>
      <div class="post-info">
        <span class="post-author">${escHtml(post.author)}</span>
        <p class="post-caption">${escHtml(post.caption || '')}</p>
        <button class="btn-comment">💬 댓글 ${post.comments.length}</button>
      </div>`;
    card.querySelector('.btn-comment').addEventListener('click', () => openComments(post.id));
    grid.appendChild(card);
  });
}

function openComments(postId) {
  activePostId = postId;
  const post = currentPosts.find(p => p.id === postId);
  if (!post) return;

  const list = document.getElementById('comments-list');
  if (post.comments.length === 0) {
    list.innerHTML = `<div class="empty-state" style="padding:30px 0"><p>아직 댓글이 없어요.<br>첫 응원을 남겨보세요! 🔥</p></div>`;
  } else {
    list.innerHTML = post.comments
      .map(c => `
        <div class="comment">
          <div class="comment-top">
            <span class="comment-author">${escHtml(c.author)}</span>
            <span class="comment-time">${formatDate(c.createdAt)}</span>
          </div>
          <p class="comment-text">${escHtml(c.text)}</p>
        </div>`)
      .join('');
  }

  openModal('comments-modal');
}

// ── Modal ─────────────────────────────────────
function openModal(id) { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }

document.querySelectorAll('.modal-backdrop').forEach(el => {
  el.addEventListener('click', e => { if (e.target === el) el.classList.remove('active'); });
});

document.getElementById('btn-upload').addEventListener('click', () => openModal('upload-modal'));

document.getElementById('input-photo').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    document.getElementById('preview-img').src = ev.target.result;
    document.getElementById('image-preview').style.display = 'block';
  };
  reader.readAsDataURL(file);
});

document.getElementById('upload-form').addEventListener('submit', async e => {
  e.preventDefault();
  const author = document.getElementById('input-author').value.trim();
  const caption = document.getElementById('input-caption').value.trim();
  const file = document.getElementById('input-photo').files[0];
  if (!author || !file) return;

  closeModal('upload-modal');
  e.target.reset();
  document.getElementById('image-preview').style.display = 'none';
  await uploadPhoto(author, caption, file);
});

document.getElementById('comment-form').addEventListener('submit', async e => {
  e.preventDefault();
  const author = document.getElementById('input-comment-author').value.trim();
  const text = document.getElementById('input-comment-text').value.trim();
  if (!author || !text || !activePostId) return;

  closeModal('comments-modal');
  document.getElementById('input-comment-author').value = '';
  document.getElementById('input-comment-text').value = '';
  await addComment(activePostId, author, text);
});

// ── Utils ─────────────────────────────────────
function compressImage(file, maxWidth = 1200, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const ratio = Math.min(maxWidth / img.width, 1);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * ratio);
        canvas.height = Math.round(img.height * ratio);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality).split(',')[1]);
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

function formatDate(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

function escHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

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

requireAuth(init);
