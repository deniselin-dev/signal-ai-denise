const $ = s => document.querySelector(s);
const ago = date => { const h = Math.max(0, Math.round((Date.now() - new Date(date)) / 36e5)); return h < 1 ? 'Just now' : `${h}h ago`; };
function renderCard(item, i) { const n = $('#trend-card').content.cloneNode(true); n.querySelector('.pill').textContent = i === 0 ? '★ Lead story' : `Trending ${i + 1}`; n.querySelector('.score').textContent = `${item.score}/100`; n.querySelector('h3').textContent = item.title; n.querySelector('.summary').textContent = item.summary; n.querySelector('.why span').textContent = item.why; n.querySelector('.source').textContent = item.source; n.querySelector('time').textContent = ago(item.publishedAt); const a = n.querySelector('a'); a.href = item.url; return n; }
function renderMore(item, i) { const e = document.createElement('article'); e.className = 'more-item'; e.innerHTML = `<span class="number">0${i + 4}</span><div><h3>${safe(item.title)}</h3><p>${safe(item.summary)}</p></div><a href="${safe(item.url)}" target="_blank" rel="noreferrer">Read source ↗</a>`; return e; }
function safe(t) { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; }
function setStatus(text, type = '') { const status = $('#status'); status.textContent = text; status.className = `status ${type}`.trim(); }
function renderEmpty(message) { const e = document.createElement('article'); e.className = 'empty'; e.textContent = message; return e; }
async function getJson(url, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw new Error(`${url} returned ${response.status}`);
    return response.json();
  } finally {
    clearTimeout(timer);
  }
}
async function load() {
  try {
    const s = await getJson('/api/status', 5000);
    setStatus(s.groq ? 'Groq connected' : 'Demo mode · Groq optional', s.groq ? 'live' : '');
    const d = await getJson('/api/digest', 12000);
    const trending = Array.isArray(d.trending) ? d.trending : [];
    const moreItems = Array.isArray(d.more) ? d.more : [];
    $('#date').textContent = new Intl.DateTimeFormat('en', { weekday:'long', month:'long', day:'numeric' }).format(new Date(d.generatedAt || Date.now()));
    $('#provider').textContent = d.demo ? 'Demo briefing' : `${d.provider || 'AI'} enriched`;
    $('#count').textContent = `${trending.length + moreItems.length} selected stories`;
    $('#trending').replaceChildren(...(trending.length ? trending.map(renderCard) : [renderEmpty('No top stories yet. Try Refresh sources.')]));
    $('#more').replaceChildren(...(moreItems.length ? moreItems.map(renderMore) : [renderEmpty('No additional stories yet.')]));
  } catch (e) {
    setStatus('API offline', 'warn');
    $('#date').textContent = 'Local server unavailable';
    $('#provider').textContent = 'Start the app or use the Cloudflare URL';
    $('#count').textContent = '0 selected stories';
    $('#trending').replaceChildren(renderEmpty('The page loaded, but the app API did not respond. If you are on localhost, the local server is probably stopped.'));
    $('#more').replaceChildren(renderEmpty('Use the live Cloudflare URL or restart the local app.'));
  }
}
async function action(endpoint, button, busy, done) { button.disabled = true; const old = button.textContent; button.textContent = busy; try { const r = await fetch(endpoint, { method:'POST' }); const data = await r.json(); if (!r.ok) throw new Error(data.error); button.textContent = done; await load(); } catch (e) { alert(e.message); button.textContent = old; } finally { setTimeout(() => { button.textContent = old; button.disabled = false; }, 1600); } }
$('#refresh').addEventListener('click', e => action('/api/refresh', e.currentTarget, 'Refreshing…', 'Updated ✓'));
$('#send').addEventListener('click', e => action('/api/send', e.currentTarget, 'Sending…', 'Sent ✓'));
load();
