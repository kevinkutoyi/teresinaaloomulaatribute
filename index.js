/* =============================================================
   TRIBUTE PAGE — SCRIPTS  (with GitHub Sync)
   tribute.js
   ============================================================= */

/* ══════════════════════════════════════════
   GITHUB CONFIG
   Config stored in localStorage under 'ghConfig'.
   Data file in the repo is a single JSON file containing
   all tributes, gallery images, portrait, name, years.
══════════════════════════════════════════ */
// ── GITHUB CONFIG ─────────────────────────────────────────────
// Token is injected at deploy time via the GitHub Actions secret MY_GITHUB_TOKEN.
// It is NEVER hardcoded here. The build step writes config.js which sets
// window.__TRIBUTE_CONFIG__ before this script runs.
// Locally: create a config.js file manually (it is git-ignored).
// ─────────────────────────────────────────────────────────────
const _cfg      = (typeof window !== 'undefined' && window.__TRIBUTE_CONFIG__) || {};
const GH_TOKEN  = _cfg.token  || '';
const GH_REPO   = _cfg.repo   || '';
const GH_BRANCH = _cfg.branch || 'main';
const GH_PATH   = _cfg.path   || 'data.json';

if (!GH_TOKEN || !GH_REPO) {
  console.warn('[Tribute] GitHub token or repo not configured. Push/pull disabled. Check config.js.');
}

let ghConfig = (GH_TOKEN && GH_REPO)
  ? { token: GH_TOKEN, repo: GH_REPO, branch: GH_BRANCH, path: GH_PATH }
  : null;
// fileSha: the current SHA of data.json in GitHub (needed for updates)
let ghFileSha = null;

/* ══════════════════════════════════════════
   STATE  (loaded from localStorage on boot, then synced from GitHub)
══════════════════════════════════════════ */
let tributes      = JSON.parse(localStorage.getItem('tributes')      || '[]');
let galleryImages = JSON.parse(localStorage.getItem('galleryImages') || '[]');
let sortNewest    = true;

/* ══════════════════════════════════════════
   STORAGE HELPERS  (localStorage cache)
══════════════════════════════════════════ */
function saveTributes()    { localStorage.setItem('tributes',      JSON.stringify(tributes)); }
function saveGallery()     { localStorage.setItem('galleryImages', JSON.stringify(galleryImages)); }
function savePortrait(src) { localStorage.setItem('portrait', src); }
function saveName(val)     { localStorage.setItem('memorialName',  val); }
function saveYears(val)    { localStorage.setItem('memorialYears', val); }

/* ══════════════════════════════════════════
   BUILD THE FULL DATA SNAPSHOT
   This is what gets written to GitHub data.json
══════════════════════════════════════════ */
function buildSnapshot() {
  return {
    memorialName:  localStorage.getItem('memorialName')  || 'John Beloved Doe',
    memorialYears: localStorage.getItem('memorialYears') || '1945 — 2024',
    portrait:      localStorage.getItem('portrait')      || null,
    tributes,
    galleryImages,
    lastUpdated:   new Date().toISOString()
  };
}

/* ══════════════════════════════════════════
   APPLY A SNAPSHOT TO THE PAGE
   Used after pulling from GitHub
══════════════════════════════════════════ */
function applySnapshot(data) {
  if (!data) return;

  // Store each piece into localStorage
  if (data.memorialName)  { localStorage.setItem('memorialName',  data.memorialName);  }
  if (data.memorialYears) { localStorage.setItem('memorialYears', data.memorialYears); }
  if (data.portrait)      { localStorage.setItem('portrait',      data.portrait);      }
  if (Array.isArray(data.tributes))      { tributes      = data.tributes;      saveTributes(); }
  if (Array.isArray(data.galleryImages)) { galleryImages = data.galleryImages; saveGallery();  }

  // Refresh UI
  restorePageState();
  render();
  if (galleryImages.length > 0) renderGallery();
}

/* ══════════════════════════════════════════
   GITHUB API HELPERS
══════════════════════════════════════════ */
function ghHeaders() {
  return {
    'Authorization': `Bearer ${ghConfig.token}`,
    'Accept':        'application/vnd.github+json',
    'Content-Type':  'application/json',
    'X-GitHub-Api-Version': '2022-11-28'
  };
}

function ghFileUrl() {
  const { repo, branch, path } = ghConfig;
  return `https://api.github.com/repos/${repo}/contents/${path}?ref=${branch}`;
}

/* Fetch the current data.json from GitHub (returns parsed JS object or null) */
async function ghFetchFile() {
  const res = await fetch(ghFileUrl(), { headers: ghHeaders() });
  if (res.status === 404) return { content: null, sha: null };
  if (!res.ok) throw new Error(`GitHub fetch failed: ${res.status} ${res.statusText}`);
  const file = await res.json();
  ghFileSha = file.sha;
  const decoded = JSON.parse(atob(file.content.replace(/\n/g, '')));
  return { content: decoded, sha: file.sha };
}

/* Write the full snapshot to GitHub data.json */
async function ghWriteFile(message) {
  const snapshot = buildSnapshot();
  const encoded  = btoa(unescape(encodeURIComponent(JSON.stringify(snapshot, null, 2))));

  const body = {
    message: message || `Tribute page update — ${new Date().toLocaleString()}`,
    content: encoded,
    branch:  ghConfig.branch
  };
  if (ghFileSha) body.sha = ghFileSha;  // required for updates (not creates)

  const res = await fetch(
    `https://api.github.com/repos/${ghConfig.repo}/contents/${ghConfig.path}`,
    { method: 'PUT', headers: ghHeaders(), body: JSON.stringify(body) }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `GitHub write failed: ${res.status}`);
  }

  const result = await res.json();
  ghFileSha = result.content.sha;   // store new SHA
  return result;
}

/* ══════════════════════════════════════════
   PULL  — fetch latest from GitHub and apply
══════════════════════════════════════════ */
async function pullFromGitHub() {
  if (!ghConfig) { openGhModal(); return; }
  setGhBarState('syncing', 'Pulling from GitHub…');
  setBtnLoading('gh-pull-btn', true);
  try {
    const { content, sha } = await ghFetchFile();
    ghFileSha = sha;
    if (content) {
      applySnapshot(content);
      setGhBarState('ok', `Pulled · ${ghConfig.repo}`);
      showToast('Pulled latest from GitHub ✦');
    } else {
      setGhBarState('ok', `Connected · ${ghConfig.repo} (empty)`);
      showToast('No data file yet — push to create it ✦');
    }
  } catch (e) {
    setGhBarState('error', 'Pull failed');
    showToast('Pull failed: ' + e.message);
    console.error(e);
  } finally {
    setBtnLoading('gh-pull-btn', false);
  }
}

/* ══════════════════════════════════════════
   PUSH  — write current state to GitHub
══════════════════════════════════════════ */
async function pushToGitHub(silent = false, commitMsg = null) {
  if (!ghConfig) return;
  if (!silent) {
    setGhBarState('syncing', 'Pushing to GitHub…');
    setBtnLoading('gh-push-btn', true);
  }
  try {
    // Refresh SHA before writing to avoid conflicts
    if (!ghFileSha) {
      const { sha } = await ghFetchFile();
      ghFileSha = sha;
    }
    await ghWriteFile(commitMsg);
    setGhBarState('ok', `Synced · ${ghConfig.repo}`);
    if (!silent) showToast('Pushed to GitHub ✦');
    updateGhBar();
  } catch (e) {
    setGhBarState('error', 'Push failed');
    if (!silent) showToast('Push failed: ' + e.message);
    console.error(e);
  } finally {
    if (!silent) setBtnLoading('gh-push-btn', false);
  }
}

/* ══════════════════════════════════════════
   AUTO-PUSH HELPER  (after each change)
   Pushes silently if GitHub is configured.
══════════════════════════════════════════ */
async function autoPush(msg) {
  if (!ghConfig) return;
  try {
    // Fetch fresh SHA first so we don't get 409 conflicts
    const { sha } = await ghFetchFile();
    ghFileSha = sha;
    await ghWriteFile(msg);
    setGhBarState('ok', `Synced · ${ghConfig.repo}`);
    updateGhBar();
  } catch(e) {
    setGhBarState('error', 'Auto-push failed');
    console.error('Auto-push failed:', e);
  }
}

/* ══════════════════════════════════════════
   GITHUB CONFIG MODAL  (removed — config is hardcoded)
══════════════════════════════════════════ */
function openGhModal()  { /* no-op: config is hardcoded */ }
function closeGhModal() { /* no-op: config is hardcoded */ }

/* ══════════════════════════════════════════
   STATUS BAR HELPERS
══════════════════════════════════════════ */
function updateGhBar() {
  const indicator = document.getElementById('gh-indicator');
  const label     = document.getElementById('gh-bar-label');
  const repoEl    = document.getElementById('gh-bar-repo');
  const pullBtn   = document.getElementById('gh-pull-btn');
  const pushBtn   = document.getElementById('gh-push-btn');

  if (ghConfig) {
    indicator.className = 'gh-indicator connected';
    label.textContent   = 'GitHub connected';
    repoEl.textContent  = ghConfig.repo;
    pullBtn.disabled = false;
    pushBtn.disabled = false;
  } else {
    indicator.className = 'gh-indicator';
    label.textContent   = 'Not connected to GitHub';
    repoEl.textContent  = '';
    pullBtn.disabled = true;
    pushBtn.disabled = true;
  }
}

function setGhBarState(state, text) {
  const indicator = document.getElementById('gh-indicator');
  const label     = document.getElementById('gh-bar-label');
  indicator.className = 'gh-indicator ' + state;
  label.textContent   = text;
}

function setBtnLoading(id, loading) {
  const btn = document.getElementById(id);
  if (!btn) return;
  btn.disabled = loading;
  btn.style.opacity = loading ? '0.5' : '';
}

/* ══════════════════════════════════════════
   INIT — run after DOM is ready
══════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  restorePageState();
  initCharCounter();
  initPortraitUpload();
  initGalleryUpload();
  initLightbox();
  render();
  updateGhBar();

  // If GitHub is configured, auto-pull on load
  if (ghConfig) {
    pullFromGitHub();
  }
});

/* ══════════════════════════════════════════
   RESTORE ALL SAVED STATE ON PAGE LOAD
══════════════════════════════════════════ */
function restorePageState() {
  const savedPortrait = localStorage.getItem('portrait');
  if (savedPortrait) {
    document.getElementById('portrait-display').innerHTML =
      `<img class="hero-portrait" src="${savedPortrait}" alt="Memorial portrait"/>`;
  }

  const savedName  = localStorage.getItem('memorialName');
  const savedYears = localStorage.getItem('memorialYears');
  if (savedName)  document.getElementById('memorial-name').textContent  = savedName;
  if (savedYears) document.getElementById('memorial-years').textContent = savedYears;

  if (galleryImages.length > 0) renderGallery();
}

/* ══════════════════════════════════════════
   CHAR COUNTER
══════════════════════════════════════════ */
function initCharCounter() {
  const tributeEl = document.getElementById('tribute');
  const countEl   = document.getElementById('count');
  tributeEl.addEventListener('input', () => {
    countEl.textContent = tributeEl.value.length;
  });
}

/* ══════════════════════════════════════════
   PORTRAIT UPLOAD
══════════════════════════════════════════ */
function initPortraitUpload() {
  document.getElementById('portrait-input').addEventListener('change', function () {
    const file = this.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      const src = e.target.result;
      document.getElementById('portrait-display').innerHTML =
        `<img class="hero-portrait" src="${src}" alt="Memorial portrait"/>`;
      savePortrait(src);
      showToast('Portrait saved ✦');
      await autoPush('Update memorial portrait');
    };
    reader.readAsDataURL(file);
  });
}

/* ══════════════════════════════════════════
   EDITABLE NAME & YEARS
══════════════════════════════════════════ */
async function editName() {
  const el  = document.getElementById('memorial-name');
  const val = prompt('Enter the name of the person being honoured:', el.textContent);
  if (val && val.trim()) {
    el.textContent = val.trim();
    saveName(val.trim());
    await autoPush(`Update memorial name to "${val.trim()}"`);
  }
}

async function editYears() {
  const el  = document.getElementById('memorial-years');
  const val = prompt('Enter the years (e.g. 1945 — 2024):', el.textContent);
  if (val && val.trim()) {
    el.textContent = val.trim();
    saveYears(val.trim());
    await autoPush('Update memorial years');
  }
}

/* ══════════════════════════════════════════
   GALLERY
══════════════════════════════════════════ */
function initGalleryUpload() {
  bindGalleryInput();
}

function bindGalleryInput() {
  const input = document.getElementById('gallery-input');
  if (!input) return;
  const fresh = input.cloneNode(true);
  input.parentNode.replaceChild(fresh, input);
  fresh.addEventListener('change', function () {
    const files = Array.from(this.files);
    let loaded  = 0;
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        galleryImages.push(e.target.result);
        loaded++;
        if (loaded === files.length) {
          saveGallery();
          renderGallery();
          showToast(`${files.length === 1 ? 'Photo' : files.length + ' photos'} added ✦`);
          await autoPush(`Add ${files.length} gallery photo(s)`);
        }
      };
      reader.readAsDataURL(file);
    });
  });
}

function renderGallery() {
  const grid = document.getElementById('gallery-grid');

  const placeholderSvg = `
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2">
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <circle cx="8.5" cy="8.5" r="1.5"/>
      <polyline points="21 15 16 10 5 21"/>
    </svg>`;

  const addTile = `
    <div class="gallery-item gallery-add">
      <label for="gallery-input">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.5">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="16"/>
          <line x1="8" y1="12" x2="16" y2="12"/>
        </svg>
        Add Photo
      </label>
      <input type="file" id="gallery-input" accept="image/*" multiple/>
    </div>`;

  const totalSlots = Math.max(3, galleryImages.length);
  let html = '';

  for (let i = 0; i < totalSlots; i++) {
    if (i < galleryImages.length) {
      html += `
        <div class="gallery-item" data-index="${i}">
          <img src="${galleryImages[i]}" alt="Memory photo ${i + 1}" onclick="openLightbox(${i})"/>
          <div class="overlay">
            <span class="overlay-label" onclick="openLightbox(${i})">View</span>
            <button class="gallery-delete-btn" onclick="deleteGalleryPhoto(event, ${i})" title="Remove photo">✕</button>
          </div>
        </div>`;
    } else {
      html += `
        <div class="gallery-item">
          <div class="gallery-placeholder">${placeholderSvg}<span>Memory</span></div>
        </div>`;
    }
  }

  grid.innerHTML = html + addTile;
  bindGalleryInput();
}

async function deleteGalleryPhoto(e, index) {
  e.stopPropagation();
  if (!confirm('Remove this photo from the gallery?')) return;
  galleryImages.splice(index, 1);
  saveGallery();
  renderGallery();
  showToast('Photo removed');
  await autoPush('Remove gallery photo');
}

/* ══════════════════════════════════════════
   LIGHTBOX
══════════════════════════════════════════ */
let lightboxIndex = 0;

function initLightbox() {
  document.getElementById('lightbox').addEventListener('click', function (e) {
    if (e.target === this || e.target.closest('.lightbox-close')) {
      this.classList.remove('open');
    }
  });
  document.addEventListener('keydown', (e) => {
    const lb = document.getElementById('lightbox');
    if (!lb.classList.contains('open')) return;
    if (e.key === 'Escape')      lb.classList.remove('open');
    if (e.key === 'ArrowRight')  navigateLightbox(1);
    if (e.key === 'ArrowLeft')   navigateLightbox(-1);
  });
}

function openLightbox(index) {
  lightboxIndex = index;
  document.getElementById('lightbox-img').src = galleryImages[index];
  document.getElementById('lightbox').classList.add('open');
}

function navigateLightbox(dir) {
  lightboxIndex = (lightboxIndex + dir + galleryImages.length) % galleryImages.length;
  document.getElementById('lightbox-img').src = galleryImages[lightboxIndex];
}

/* ══════════════════════════════════════════
   SUBMIT TRIBUTE
══════════════════════════════════════════ */
async function submitTribute() {
  const name     = document.getElementById('name').value.trim();
  const relation = document.getElementById('relation').value.trim();
  const message  = document.getElementById('tribute').value.trim();

  if (!name)    return shake('name');
  if (!message) return shake('tribute');

  const entry = {
    id:       Date.now(),
    name,
    relation: relation || 'Friend',
    message,
    date:     new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
    likes:    0,
    liked:    false
  };

  tributes.unshift(entry);
  saveTributes();
  render();

  // Reset form
  document.getElementById('name').value        = '';
  document.getElementById('relation').value    = '';
  document.getElementById('tribute').value     = '';
  document.getElementById('count').textContent = '0';

  showToast('Tribute posted — thank you ✦');
  document.getElementById('tributes-section').scrollIntoView({ behavior: 'smooth', block: 'start' });

  // Push to GitHub
  await autoPush(`New tribute from ${name}`);
}

/* ══════════════════════════════════════════
   RENDER TRIBUTES
══════════════════════════════════════════ */
function render() {
  const grid   = document.getElementById('tributes-grid');
  const sorted = [...tributes].sort((a, b) => sortNewest ? b.id - a.id : a.id - b.id);

  document.getElementById('tribute-count').textContent =
    tributes.length === 1 ? '1 tribute shared' : `${tributes.length} tributes shared`;

  if (!sorted.length) {
    grid.innerHTML = `<div class="empty-state" id="empty-state"><div class="empty-state-icon">🕯</div><p>Be the first to leave a tribute.</p></div>`;
    return;
  }

  grid.innerHTML = sorted.map((t, i) => `
    <div class="tribute-card" style="animation-delay:${i * 0.06}s">
      <div class="tribute-card-inner">
        <div class="tribute-avatar">${getInitials(t.name)}</div>
        <div class="tribute-card-content">
          <p class="tribute-body">${escHtml(t.message)}</p>
          <div class="tribute-footer">
            <div class="tribute-author">
              <span class="tribute-name">${escHtml(t.name)}</span>
              <span class="tribute-relation">${escHtml(t.relation)}</span>
            </div>
            <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">
              <span class="tribute-date">${t.date}</span>
              <button class="heart-btn ${t.liked ? 'liked' : ''}" onclick="toggleLike(${t.id})">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="${t.liked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.8">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                </svg>
                ${t.likes || ''}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `).join('');
}

/* ══════════════════════════════════════════
   LIKE
══════════════════════════════════════════ */
async function toggleLike(id) {
  const t = tributes.find((x) => x.id === id);
  if (!t) return;
  t.liked = !t.liked;
  t.likes = (t.likes || 0) + (t.liked ? 1 : -1);
  saveTributes();
  render();
  await autoPush(`Like on tribute by ${t.name}`);
}

/* ══════════════════════════════════════════
   SORT
══════════════════════════════════════════ */
function toggleSort() {
  sortNewest = !sortNewest;
  document.getElementById('sort-btn').textContent = sortNewest ? 'Newest First' : 'Oldest First';
  render();
}

/* ══════════════════════════════════════════
   HELPERS
══════════════════════════════════════════ */
function escHtml(s) {
  return s
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#039;');
}

function getInitials(name) {
  return name.trim().split(/\s+/).map((w) => w[0].toUpperCase()).slice(0, 2).join('');
}

function shake(id) {
  const el = document.getElementById(id);
  el.style.borderColor = '#e57373';
  el.focus();
  el.style.animation = 'none';
  void el.offsetHeight;
  el.style.animation = 'shakeInput 0.4s ease';
  setTimeout(() => { el.style.borderColor = ''; el.style.animation = ''; }, 1200);
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3200);
}