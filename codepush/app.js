const GITHUB_TOKEN = () => localStorage.getItem('githubToken') || '';

// ── State ──────────────────────────────────────────────────────────────────
let uploadedFiles = [];
let visibility    = 'public';
let repoMode      = 'new'; // 'new' | 'update'

// ── Settings ───────────────────────────────────────────────────────────────
function loadSettings() {
  document.getElementById('ollama-url').value   = localStorage.getItem('ollamaUrl')    || 'http://localhost:11434';
  document.getElementById('token-date').value   = localStorage.getItem('tokenDate')    || '';
  document.getElementById('github-token').value = localStorage.getItem('githubToken')  || '';
  window._savedModel = localStorage.getItem('ollamaModel') || '';
  renderTokenBanner();
}

function saveSettings() {
  const tok = document.getElementById('github-token').value.trim();
  if (tok) localStorage.setItem('githubToken', tok);
  localStorage.setItem('ollamaUrl',   document.getElementById('ollama-url').value.trim());
  localStorage.setItem('ollamaModel', document.getElementById('ollama-model').value);
  localStorage.setItem('tokenDate',   document.getElementById('token-date').value);
  renderTokenBanner();
  addLog('Settings saved.', 'success');
}

// ── Token expiry banner ─────────────────────────────────────────────────────
function renderTokenBanner() {
  const banner  = document.getElementById('token-banner');
  const dateVal = document.getElementById('token-date').value || localStorage.getItem('tokenDate');
  if (!dateVal) { banner.style.display = 'none'; return; }

  const created  = new Date(dateVal);
  const expires  = new Date(created);
  expires.setDate(expires.getDate() + 90);

  const today    = new Date(); today.setHours(0,0,0,0);
  const daysLeft = Math.ceil((expires - today) / 86400000);
  const expStr   = expires.toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' });

  let cls, icon, msg;
  if (daysLeft > 30)     { cls='green';  icon='&#9989;';           msg=`GitHub token is valid &mdash; expires <strong>${expStr}</strong>`; }
  else if (daysLeft > 10){ cls='yellow'; icon='&#9888;&#65039;';   msg=`Token expires soon &mdash; <strong>${expStr}</strong>. Renew before then.`; }
  else if (daysLeft > 0) { cls='red';    icon='&#128680;';         msg=`Token expires in <strong>${daysLeft} day${daysLeft===1?'':'s'}</strong> on <strong>${expStr}</strong>. Renew now!`; }
  else                   { cls='red';    icon='&#10060;';          msg=`Token <strong>expired</strong> on <strong>${expStr}</strong>. Generate a new one.`; }

  banner.className     = `token-banner ${cls}`;
  banner.style.display = 'flex';
  banner.innerHTML     = `<span class="tb-icon">${icon}</span><span class="tb-text">${msg}</span><span class="tb-days">${daysLeft > 0 ? daysLeft+'d left' : 'Expired'}</span>`;
}

// ── Card toggle ────────────────────────────────────────────────────────────
function toggleCard(id) {
  const body  = document.getElementById(id + '-body');
  const arrow = document.getElementById(id + '-arrow');
  const open  = !body.classList.contains('hidden');
  body.classList.toggle('hidden', open);
  arrow.classList.toggle('open', !open);
}

// ── Mode (new / update) ────────────────────────────────────────────────────
function setMode(m) {
  repoMode = m;
  document.getElementById('mode-new').className    = 'mode-btn' + (m === 'new'    ? ' active' : '');
  document.getElementById('mode-update').className = 'mode-btn' + (m === 'update' ? ' active' : '');
  document.getElementById('new-repo-fields').style.display    = m === 'new'    ? '' : 'none';
  document.getElementById('update-repo-fields').style.display = m === 'update' ? '' : 'none';
  document.getElementById('preview-card').style.display = 'none';
}

// ── Visibility ─────────────────────────────────────────────────────────────
function setVisibility(v) {
  visibility = v;
  document.getElementById('btn-public').className  = 'vis-btn' + (v === 'public'  ? ' active' : '');
  document.getElementById('btn-private').className = 'vis-btn' + (v === 'private' ? ' active' : '');
}

// ── Ollama model dropdown ──────────────────────────────────────────────────
async function loadOllamaModels() {
  const url = document.getElementById('ollama-url').value.trim() || 'http://localhost:11434';
  const sel = document.getElementById('ollama-model');
  try {
    const res   = await fetch(`${url}/api/tags`);
    const data  = await res.json();
    const models = (data.models || []).map(m => m.name);
    sel.innerHTML = models.length
      ? models.map(m => `<option value="${m}">${m}</option>`).join('')
      : '<option value="">No models found</option>';
    if (window._savedModel) sel.value = window._savedModel;
  } catch {
    sel.innerHTML = '<option value="">Could not reach Ollama</option>';
  }
}

// ── Existing repo dropdown (Update mode) ───────────────────────────────────
async function loadExistingRepoDropdown() {
  const sel = document.getElementById('existing-repo-select');
  sel.innerHTML = '<option value="">Loading…</option>';
  try {
    const repos = await ghFetch('/user/repos?per_page=100&sort=updated');
    sel.innerHTML = repos.length
      ? repos.map(r => `<option value="${r.full_name}">${r.full_name} ${r.private ? '🔒' : '🌐'}</option>`).join('')
      : '<option value="">No repositories found</option>';
  } catch (err) {
    sel.innerHTML = `<option value="">Error: ${err.message}</option>`;
  }
}

// ── File helpers ───────────────────────────────────────────────────────────
const TEXT_EXTS = new Set([
  'js','ts','jsx','tsx','mjs','cjs',
  'py','rb','php','java','c','cpp','h','hpp','cs','go','rs','swift','kt','kts',
  'sh','bash','zsh','fish','ps1','bat','cmd',
  'json','yaml','yml','toml','ini','cfg','conf','env','xml','html','htm','css','scss','sass','less',
  'md','txt','rst','csv','sql','graphql','gql',
  'r','m','lua','pl','ex','exs','clj','cljs','hs','elm','dart','vue','svelte','astro',
]);

function isTextPath(path) {
  const name = path.split('/').pop().toLowerCase();
  if (['dockerfile','makefile','.gitignore','.env','.env.example'].includes(name)) return true;
  const ext = name.includes('.') ? name.split('.').pop() : '';
  return TEXT_EXTS.has(ext);
}

function readAsText(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload  = e => res(e.target.result);
    r.onerror = rej;
    r.readAsText(file);
  });
}

async function handleFiles(fileList) {
  uploadedFiles = [];
  const arr = Array.from(fileList);
  if (arr.length === 1 && arr[0].name.toLowerCase().endsWith('.zip')) {
    await extractZip(arr[0]);
  } else {
    for (const f of arr) {
      if (isTextPath(f.name)) uploadedFiles.push({ path: f.name, content: await readAsText(f) });
    }
  }
  renderFileList();
}

async function extractZip(file) {
  const zip = await JSZip.loadAsync(file);
  const tasks = [];
  zip.forEach((relPath, entry) => {
    if (!entry.dir && isTextPath(relPath))
      tasks.push(entry.async('string').then(c => uploadedFiles.push({ path: relPath, content: c })));
  });
  await Promise.all(tasks);
  uploadedFiles.sort((a, b) => a.path.localeCompare(b.path));
}

function renderFileList() {
  const el = document.getElementById('file-list');
  if (!uploadedFiles.length) { el.innerHTML = ''; return; }
  el.innerHTML =
    `<div class="file-count">${uploadedFiles.length} file(s) ready</div>` +
    uploadedFiles.map(f =>
      `<div class="file-item">
        <span style="color:#388bfd">&#128196;</span>
        <span class="fi-name">${f.path}</span>
        <span class="fi-size">${fmtBytes(f.content.length)}</span>
      </div>`
    ).join('');
}

function fmtBytes(n) { return n < 1024 ? n + ' B' : (n / 1024).toFixed(1) + ' KB'; }

// ── Drag & drop ────────────────────────────────────────────────────────────
const dropZone = document.getElementById('drop-zone');
dropZone.addEventListener('dragover',  e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', ()  => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', async e => { e.preventDefault(); dropZone.classList.remove('drag-over'); await handleFiles(e.dataTransfer.files); });
document.getElementById('file-input').addEventListener('change', async e => { await handleFiles(e.target.files); });

// ── Log ────────────────────────────────────────────────────────────────────
function addLog(msg, type = 'info') {
  document.getElementById('log-card').style.display = 'block';
  const el = document.getElementById('log');
  el.innerHTML += `<div class="log-line ${type}">[${new Date().toLocaleTimeString()}] ${msg}</div>`;
  el.scrollTop = el.scrollHeight;
}

// ── README char count ──────────────────────────────────────────────────────
function updateCharCount() {
  const val = document.getElementById('readme-editor').value;
  document.getElementById('preview-chars').textContent = `${val.length.toLocaleString()} chars`;
}

// ── Ollama ─────────────────────────────────────────────────────────────────
async function generateReadme(fileList) {
  const ollamaUrl = localStorage.getItem('ollamaUrl') || 'http://localhost:11434';
  const model     = localStorage.getItem('ollamaModel');
  if (!model) throw new Error('No Ollama model selected in Settings.');

  const MAX_PER_FILE = 4000, MAX_TOTAL = 24000;
  let totalChars = 0;
  const parts = [];

  for (const f of fileList) {
    let content = f.content.trimEnd();
    if (content.length > MAX_PER_FILE)
      content = content.slice(0, MAX_PER_FILE) + `\n[... truncated (${fmtBytes(f.content.length)} total)]`;
    const chunk = `### ${f.path}\n\`\`\`\n${content}\n\`\`\``;
    if (totalChars + chunk.length > MAX_TOTAL) { parts.push(`### (${fileList.length - parts.length} more files omitted to fit context)`); break; }
    parts.push(chunk);
    totalChars += chunk.length;
  }

  const prompt =
`You are a technical documentation expert. Read the code files below and produce a complete, well-structured README.md.

Required sections (use these exact headings):
# <Project Name>
## Description
## Features
## Requirements
## Installation
## Usage
## File Structure

Rules:
- Infer the project name from the code or file names.
- Under Usage, provide real command examples (not placeholders).
- Be concise but complete.
- Respond with ONLY the README.md markdown content — no preamble, no commentary.

---
${parts.join('\n\n')}`;

  const res = await fetch(`${ollamaUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt, stream: false })
  });
  if (!res.ok) { const t = await res.text(); throw new Error(`Ollama ${res.status}: ${t}`); }
  const data = await res.json();
  if (!data.response) throw new Error('Ollama returned an empty response. Is the model loaded?');
  return data.response;
}

// ── GitHub API ─────────────────────────────────────────────────────────────
function ghFetch(path, method = 'GET', body = null) {
  return fetch('https://api.github.com' + path, {
    method,
    headers: {
      Authorization: `token ${GITHUB_TOKEN()}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  }).then(async r => {
    if (method === 'DELETE' && r.status === 204) return {};
    const d = await r.json();
    if (!r.ok) throw new Error(d.errors?.[0]?.message || d.message || `GitHub ${r.status}`);
    return d;
  });
}

function toBase64(str) { return btoa(unescape(encodeURIComponent(str))); }

// Push files to an EXISTING repo (new commit on top of current HEAD)
async function pushToExistingRepo(fullName, files, commitMsg) {
  addLog('Fetching repo info…', 'wait');
  const repoInfo    = await ghFetch(`/repos/${fullName}`);
  const branch      = repoInfo.default_branch || 'main';

  addLog('Fetching current HEAD…', 'wait');
  const ref         = await ghFetch(`/repos/${fullName}/git/ref/heads/${branch}`);
  const headSha     = ref.object.sha;

  addLog('Fetching current tree…', 'wait');
  const headCommit  = await ghFetch(`/repos/${fullName}/git/commits/${headSha}`);
  const baseTreeSha = headCommit.tree.sha;

  addLog(`Creating ${files.length} blob(s)…`, 'wait');
  const blobs = await Promise.all(files.map(f =>
    ghFetch(`/repos/${fullName}/git/blobs`, 'POST', { content: toBase64(f.content), encoding: 'base64' })
      .then(b => ({ path: f.path, sha: b.sha, mode: '100644', type: 'blob' }))
  ));

  addLog('Building tree on top of existing files…', 'wait');
  const tree = await ghFetch(`/repos/${fullName}/git/trees`, 'POST', { base_tree: baseTreeSha, tree: blobs });

  addLog('Creating commit…', 'wait');
  const commit = await ghFetch(`/repos/${fullName}/git/commits`, 'POST', {
    message: commitMsg || 'Update via CodePush',
    tree: tree.sha, parents: [headSha]
  });

  addLog(`Updating ${branch} branch…`, 'wait');
  await ghFetch(`/repos/${fullName}/git/refs/heads/${branch}`, 'PATCH', { sha: commit.sha });

  return `https://github.com/${fullName}`;
}

// ── Step 1: Generate README ────────────────────────────────────────────────
async function step1() {
  const ollamaModel = localStorage.getItem('ollamaModel') || '';

  if (!GITHUB_TOKEN())
    return alert('Please paste your GitHub token in Settings and save.');
  if (!uploadedFiles.length) return alert('Please upload at least one file first.');
  if (!ollamaModel)          return alert('Please select an Ollama model in Settings.');

  const btn = document.getElementById('step1-btn');
  btn.disabled = true;
  btn.textContent = 'Generating…';
  document.getElementById('log').innerHTML = '';
  document.getElementById('log-card').style.display = 'none';
  document.getElementById('result-area').innerHTML = '';

  try {
    addLog(`Sending ${uploadedFiles.length} file(s) to Ollama (${ollamaModel})…`, 'info');
    const readme = await generateReadme(uploadedFiles);
    addLog('README.md generated. Review and edit below, then click Push.', 'success');

    const editor = document.getElementById('readme-editor');
    editor.value = readme;
    updateCharCount();
    document.getElementById('preview-card').style.display = 'block';
    editor.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    addLog('ERROR: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span class="step-badge">1</span> Generate README with Ollama';
  }
}

// ── Step 2: Push to GitHub ─────────────────────────────────────────────────
async function step2() {
  const readmeContent = document.getElementById('readme-editor').value.trim();
  if (!readmeContent) return alert('README is empty. Please generate or write content first.');

  const btn = document.getElementById('step2-btn');
  btn.disabled = true;
  document.getElementById('result-area').innerHTML = '';

  try {
    addLog('Authenticating with GitHub…', 'info');
    const user = await ghFetch('/user');
    addLog(`Authenticated as @${user.login}`, 'success');

    const allFiles = [...uploadedFiles, { path: 'README.md', content: readmeContent }];
    let repoUrl;

    if (repoMode === 'new') {
      const repoName = document.getElementById('repo-name').value.trim();
      if (!repoName) { btn.disabled = false; return alert('Please enter a repository name.'); }

      addLog(`Creating "${repoName}" (${visibility})…`, 'info');
      const repo = await ghFetch('/user/repos', 'POST', {
        name: repoName, private: visibility === 'private',
        auto_init: true, description: 'Auto-generated by CodePush'
      });
      addLog(`Repository created: ${repo.full_name}`, 'success');

      addLog(`Pushing ${allFiles.length} file(s)…`, 'info');
      await pushToExistingRepo(repo.full_name, allFiles, 'Initial commit — auto-generated by CodePush');
      repoUrl = repo.html_url;

    } else {
      const fullName = document.getElementById('existing-repo-select').value;
      if (!fullName) { btn.disabled = false; return alert('Please select a repository to update.'); }
      const commitMsg = document.getElementById('commit-msg').value.trim() || 'Update via CodePush';

      addLog(`Updating "${fullName}"…`, 'info');
      repoUrl = await pushToExistingRepo(fullName, allFiles, commitMsg);
    }

    addLog('All files pushed!', 'success');
    addLog(`Done! ${repoUrl}`, 'success');

    document.getElementById('result-area').innerHTML = `
      <div class="result-card">
        <h3>&#10003; ${repoMode === 'new' ? 'Repository Published!' : 'Repository Updated!'}</h3>
        <a href="${repoUrl}" target="_blank" class="result-link">${repoUrl}</a><br/>
        <button class="btn-copy" onclick="copyLink('${repoUrl}',this)">Copy Link</button>
      </div>`;

    if (!document.getElementById('repos-body').classList.contains('hidden')) loadRepos();
  } catch (err) {
    addLog('ERROR: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

function copyLink(url, btn) {
  navigator.clipboard.writeText(url).then(() => {
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = 'Copy Link'; }, 2000);
  });
}

// ── My Repositories ────────────────────────────────────────────────────────
async function loadRepos() {
  const el = document.getElementById('repo-list');
  el.innerHTML = '<p class="repo-loading">Loading repositories…</p>';
  try {
    const repos = await ghFetch('/user/repos?per_page=100&sort=updated');
    if (!repos.length) { el.innerHTML = '<p class="repo-empty">No repositories found.</p>'; return; }
    el.innerHTML = repos.map(r => `
      <div class="repo-item" id="repo-row-${r.id}">
        <span class="ri-name"><a href="${r.html_url}" target="_blank">${r.full_name}</a></span>
        <span class="repo-vis ${r.private ? 'private' : 'public'}">${r.private ? '&#128274; Private' : '&#127760; Public'}</span>
        <button class="btn-copy-repo" id="copy-btn-${r.id}" onclick="copyRepoLink('${r.html_url}',${r.id})">&#128279; Copy Link</button>
        <button class="btn-delete" onclick="deleteRepo('${r.full_name}',${r.id})">Delete</button>
      </div>`
    ).join('');
  } catch (err) {
    el.innerHTML = `<p class="repo-empty" style="color:#f85149">Error: ${err.message}</p>`;
  }
}

function copyRepoLink(url, id) {
  navigator.clipboard.writeText(url).then(() => {
    const btn = document.getElementById(`copy-btn-${id}`);
    btn.textContent = '✓ Copied!';
    btn.classList.add('copied');
    setTimeout(() => { btn.innerHTML = '&#128279; Copy Link'; btn.classList.remove('copied'); }, 2000);
  });
}

async function deleteRepo(fullName, id) {
  if (!confirm(`Delete "${fullName}"?\n\nThis is permanent and cannot be undone.`)) return;
  const row = document.getElementById(`repo-row-${id}`);
  row.style.opacity = '0.4';
  try {
    await ghFetch(`/repos/${fullName}`, 'DELETE');
    row.remove();
  } catch (err) {
    row.style.opacity = '1';
    alert('Delete failed: ' + err.message + '\n\nMake sure your token has the "delete_repo" scope enabled.');
  }
}

// ── Init ───────────────────────────────────────────────────────────────────
loadSettings();
loadOllamaModels();
toggleCard('settings');
toggleCard('repos');
