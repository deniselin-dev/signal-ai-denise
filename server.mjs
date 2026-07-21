import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
loadEnv(path.join(root, '.env'));
loadEnv(path.join(root, 'YOUR_API_KEYS.env'));
const PORT = Number(process.env.PORT || 4173);
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';
const TELEGRAM_BOT_TOKEN = cleanOptionalSecret(process.env.TELEGRAM_BOT_TOKEN);
const TELEGRAM_CHAT_ID = cleanOptionalSecret(process.env.TELEGRAM_CHAT_ID);
const WATCHLIST = (process.env.WATCHLIST || 'OpenAI,Anthropic Claude,Google Gemini,DeepMind,Meta Llama,Mistral,DeepSeek,Kimi Moonshot,Qwen Alibaba,xAI Grok,NVIDIA AI chips').split(',').map(item => item.trim()).filter(Boolean);

function googleNewsFeed(name, query, authority = 7) {
  return { name, url: `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`, authority };
}

const INDUSTRY_FEEDS = [
  googleNewsFeed('AI Industry Front Page', '(artificial intelligence OR generative AI OR foundation model) when:3d', 9),
  googleNewsFeed('AI Models & Labs', '(OpenAI OR Anthropic OR Claude OR Gemini OR DeepMind OR Llama OR Mistral OR DeepSeek OR Kimi OR Qwen OR Grok) (model OR AI) when:7d', 9),
  googleNewsFeed('AI Research & Benchmarks', '(AI research OR artificial intelligence benchmark OR frontier model OR multimodal AI) when:7d', 8),
  googleNewsFeed('AI Agents & Developer Tools', '(AI agents OR coding agents OR AI developer tools OR Copilot OR Cursor OR Codex) when:7d', 8),
  googleNewsFeed('AI Hardware & Chips', '(AI chips OR GPU OR NVIDIA OR AMD OR inference chip OR TPU OR accelerator) when:7d', 9),
  googleNewsFeed('AI Data Centers & Power', '(AI data center OR data centre OR AI infrastructure OR energy demand OR power grid OR cooling) when:7d', 9),
  googleNewsFeed('AI Enterprise Adoption', '(enterprise AI OR AI productivity OR workplace AI OR AI deployment OR AI transformation) when:7d', 9),
  googleNewsFeed('AI Markets & Capital', '(AI stocks OR AI funding OR AI investment OR AI revenue OR AI valuation OR AI capex) when:7d', 8),
  googleNewsFeed('AI Policy & Safety', '(AI regulation OR AI safety OR AI governance OR AI copyright OR AI lawsuit) when:7d', 8),
  googleNewsFeed('AI Startups & Products', '(AI startup OR AI product launch OR AI acquisition OR AI partnership) when:7d', 7)
];

const SOURCES = [
  ...INDUSTRY_FEEDS,
  ...WATCHLIST.map(term => googleNewsFeed(`Priority Watch: ${term}`, `${term} (AI OR artificial intelligence OR model OR chips OR enterprise) when:30d`, 7)),
  { name: 'OpenAI News', url: 'https://openai.com/news/rss.xml', authority: 10 },
  { name: 'Hugging Face Blog', url: 'https://huggingface.co/blog/feed.xml', authority: 9 },
  { name: 'MIT Technology Review', url: 'https://www.technologyreview.com/feed/', authority: 8 },
  { name: 'Google AI Updates', url: 'https://blog.google/feed/', authority: 9 },
  { name: 'Ars Technica AI', url: 'https://feeds.arstechnica.com/arstechnica/technology-lab', authority: 8 },
  { name: 'TechCrunch AI', url: 'https://techcrunch.com/category/artificial-intelligence/feed/', authority: 7 }
];

const demoItems = [
  { title: 'Open-weight models are moving from experimentation to production', source: 'Hugging Face Blog', publishedAt: isoHoursAgo(2), url: 'https://huggingface.co/blog', topics: ['Models', 'Open source'], summary: 'New open-weight releases are making it easier for teams to run capable models on their own infrastructure. The shift is lowering experimentation costs and improving control over sensitive data. Expect more companies to evaluate a private-model path alongside hosted APIs.', why: 'Signals continued pressure toward cheaper, more controllable AI deployment.', authority: 9, momentum: 8, novelty: 8 },
  { title: 'AI governance is becoming a product decision, not just a legal one', source: 'MIT Technology Review', publishedAt: isoHoursAgo(5), url: 'https://www.technologyreview.com/topic/artificial-intelligence/', topics: ['Policy', 'Safety'], summary: 'Teams building AI products are increasingly designing for traceability, user controls, and model evaluation from the outset. These requirements influence product roadmaps as regulation and enterprise procurement mature. The practical focus is shifting from principles to implementation.', why: 'Governance requirements can determine which AI products enterprises will adopt.', authority: 8, momentum: 7, novelty: 7 },
  { title: 'Agent tooling is focusing on reliability and evaluation', source: 'TechCrunch AI', publishedAt: isoHoursAgo(9), url: 'https://techcrunch.com/category/artificial-intelligence/', topics: ['Agents', 'Developer tools'], summary: 'The next wave of agent tooling is emphasizing guardrails, observability, and repeatable evaluation rather than just autonomous demos. Builders are trying to make multi-step AI workflows useful in real operations. This is a meaningful maturity signal for the agent ecosystem.', why: 'Reliable agents could unlock practical automation beyond chat interfaces.', authority: 7, momentum: 8, novelty: 8 },
  { title: 'Research teams are improving efficient inference techniques', source: 'Hugging Face Blog', publishedAt: isoHoursAgo(13), url: 'https://huggingface.co/blog', topics: ['Research', 'Infrastructure'], summary: 'New optimization approaches aim to reduce the compute needed to serve capable language models. Better efficiency helps smaller teams experiment with stronger systems and may reduce the cost of deployed AI features.', why: 'Inference costs remain one of the biggest constraints on AI adoption.', authority: 9, momentum: 6, novelty: 7 },
  { title: 'Startups are packaging domain-specific AI workflows', source: 'TechCrunch AI', publishedAt: isoHoursAgo(17), url: 'https://techcrunch.com/category/artificial-intelligence/', topics: ['Startups', 'Business'], summary: 'Rather than offering generic chatbots, newer products are pairing AI with focused workflows and industry data. The approach makes value easier to measure, though data quality and integration remain the hard parts.', why: 'Vertical AI is a useful indicator of where adoption may become durable.', authority: 7, momentum: 6, novelty: 6 }
];

let digest = makeDigest(demoItems, true);

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
}

function isoHoursAgo(hours) { return new Date(Date.now() - hours * 3600000).toISOString(); }
function escapeHtml(s = '') { return s.replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c])); }
function stripHtml(s = '') { return s.replace(/<[^>]*>/g, ' ').replace(/&[^;]+;/g, ' ').replace(/\s+/g, ' ').trim(); }
function cleanOptionalSecret(value = '') {
  const trimmed = String(value).trim();
  return /^(|n\/a|na|none|null|undefined)$/i.test(trimmed) ? '' : trimmed;
}

function rank(item, interests = []) {
  const ageHours = (Date.now() - new Date(item.publishedAt).getTime()) / 3600000;
  const freshness = Math.max(0, 20 - ageHours * 0.7);
  const relevance = interests.length ? item.topics.filter(t => interests.includes(t)).length * 4 : 6;
  const AIjudgment = (Number(item.importance) || 5) * 2 + (Number(item.marketImpact) || 0) * 1.4 + (Number(item.enterpriseImpact) || 0) * 1.4 + (Number(item.breakthrough) || 0) * 1.2;
  return Math.round(Math.min(100, item.authority * 2.3 + item.momentum * 2.2 + item.novelty * 1.8 + freshness + relevance + AIjudgment));
}

function makeDigest(items, demo = false, interests = []) {
  const scored = items.map(item => ({ ...item, score: rank(item, interests) })).sort((a, b) => b.score - a.score);
  return { generatedAt: new Date().toISOString(), demo, provider: GROQ_API_KEY ? 'Groq' : 'Built-in fallback', sources: SOURCES.map(s => s.name), trending: scored.slice(0, 3), more: scored.slice(3) };
}

function parseFeed(xml, source) {
  const blocks = [...xml.matchAll(/<(?:item|entry)[\s\S]*?<\/(?:item|entry)>/gi)].slice(0, 4);
  return blocks.map(block => {
    const part = block[0];
    const value = tag => stripHtml((part.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i')) || [, ''])[1].replace(/<!\[CDATA\[|\]\]>/g, ''));
    const link = value('link') || ((part.match(/<link[^>]+href=["']([^"']+)["']/i) || [, ''])[1]);
    return { title: value('title'), url: link, publishedAt: new Date(value('pubDate') || value('published') || value('updated') || Date.now()).toISOString(), source: source.name, authority: source.authority, momentum: 5, novelty: 5, topics: ['AI'], raw: value('description') || value('summary') || value('content') };
  }).filter(i => i.title && i.url);
}

function heuristicEnrich(item) {
  const text = `${item.title} ${item.raw || ''}`.toLowerCase();
  const isAI = /\b(ai|artificial intelligence|model|llm|machine learning|openai|anthropic|deepmind|agent)\b/.test(text);
  const topics = [];
  if (/policy|regulat|law|safety/.test(text)) topics.push('Policy');
  if (/research|paper|benchmark/.test(text)) topics.push('Research');
  if (/open.source|open.weight/.test(text)) topics.push('Open source');
  if (/agent/.test(text)) topics.push('Agents');
  if (/startup|funding|raise/.test(text)) topics.push('Startups');
  if (/chip|gpu|hardware|storage|ssd|data center|data centre|power|energy|cooling|inference/.test(text)) topics.push('Hardware');
  if (/market|stock|funding|investment|valuation|revenue/.test(text)) topics.push('Markets');
  if (/enterprise|productivity|deploy|workforce/.test(text)) topics.push('Enterprise');
  if (/multimodal|video|image|voice|audio|vision/.test(text)) topics.push('Multimodal');
  return { ...item, isAI, topics: topics.length ? topics : ['AI'], summary: (item.raw || item.title).slice(0, 300), why: 'Selected for freshness and AI relevance.', importance: 5, marketImpact: topics.includes('Markets') ? 6 : 0, enterpriseImpact: topics.includes('Enterprise') ? 6 : 0, breakthrough: topics.includes('Hardware') || topics.includes('Research') ? 5 : 0 };
}

async function groqEnrich(item) {
  const prompt = `You are the editor of an AI intelligence briefing for a business reader who wants the whole AI industry, not a narrow model-watch feed. Include stories that materially affect AI: frontier and open models; research benchmarks; multimodal AI; agents and developer tools; AI chips, GPUs, storage, data centers, power and inference infrastructure; enterprise deployment, product adoption, workforce and productivity; startup funding, acquisitions, partnerships, public-company revenue, market impact and capex; policy, safety, copyright and lawsuits. Exclude generic tech, pure marketing, and articles where AI is only a buzzword. Write a factual news brief, never a vague overview. The first sentence MUST name the central company, model, product, organization, market, or infrastructure asset from the source title and say exactly what happened. Include concrete details from the source when available (for example a model name, benchmark, funding amount, product name, customer, date, chip, data center, or regulation). Do not invent facts. Return ONLY JSON with isAI (boolean), summary (an array of exactly 3 concise sentences), why (one specific sentence), topics (array chosen from Models, Research, Multimodal, Policy, Safety, Agents, Open source, Developer tools, Startups, Markets, Hardware, Infrastructure, Data centers, Enterprise, Productivity), importance (0-10), marketImpact (0-10), enterpriseImpact (0-10), breakthrough (0-10).\nSOURCE HEADLINE: ${item.title}\nSOURCE TEXT: ${(item.raw || '').slice(0, 4500)}`;
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: GROQ_MODEL, temperature: 0.2, response_format: { type: 'json_object' }, messages: [{ role: 'user', content: prompt }] }) });
  if (!response.ok) throw new Error(`Groq ${response.status}`);
  const body = await response.json();
  const generated = JSON.parse(body.choices[0].message.content);
  // Smaller models sometimes return a JSON array for a multi-sentence summary.
  // Normalize it before it reaches the UI or Telegram message.
  if (Array.isArray(generated.summary)) generated.summary = generated.summary.join(' ');
  if (Array.isArray(generated.why)) generated.why = generated.why.join(' ');
  return { ...item, ...generated, title: item.title };
}

async function refreshDigest() {
  const results = await Promise.allSettled(SOURCES.map(async source => parseFeed(await (await fetch(source.url, { headers: { 'User-Agent': 'Signal-AI-Briefing/0.1' } })).text(), source)));
  const raw = results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
  const unique = [...new Map(raw.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt)).map(i => [i.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 80), i])).values()];
  // Keep source diversity: a busy general feed must not hide a timely watchlist item.
  const onePerSource = SOURCES.map(source => unique.find(item => item.source === source.name)).filter(Boolean);
  const candidates = [...new Map([...onePerSource, ...unique].map(item => [item.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 80), item])).values()].slice(0, 12);
  const enriched = [];
  for (const item of candidates) {
    try { enriched.push(GROQ_API_KEY ? await groqEnrich(item) : heuristicEnrich(item)); } catch { enriched.push(heuristicEnrich(item)); }
  }
  const accepted = enriched.filter(i => i.isAI);
  digest = makeDigest(accepted.length ? accepted : demoItems, !GROQ_API_KEY);
  return digest;
}

function telegramText(data) {
  const lines = ['🧠 *Signal — AI Daily Briefing*', '', '*Trending today*'];
  for (const item of data.trending) lines.push(`\n*${item.title}*\n${item.summary}\n[Read more](${item.url})`);
  if (data.more.length) { lines.push('\n*More AI news*'); for (const item of data.more) lines.push(`• [${item.title}](${item.url})`); }
  return lines.join('\n');
}

async function sendTelegram() {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) throw new Error('Add TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID to .env first.');
  const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: telegramText(digest), parse_mode: 'Markdown', disable_web_page_preview: true }) });
  if (!response.ok) throw new Error(`Telegram ${response.status}`);
}

const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  res.setHeader('Cache-Control', 'no-store');
  if (url.pathname === '/api/digest') return json(res, 200, digest);
  if (url.pathname === '/api/status') return json(res, 200, { groq: Boolean(GROQ_API_KEY), telegram: Boolean(TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) });
  if (url.pathname === '/api/refresh' && req.method === 'POST') { try { return json(res, 200, await refreshDigest()); } catch (e) { return json(res, 500, { error: e.message }); } }
  if (url.pathname === '/api/send' && req.method === 'POST') { try { await sendTelegram(); return json(res, 200, { ok: true }); } catch (e) { return json(res, 400, { error: e.message }); } }
  const safePath = url.pathname === '/' ? '/index.html' : url.pathname;
  const file = path.join(root, 'public', safePath);
  if (!file.startsWith(path.join(root, 'public')) || !fs.existsSync(file)) return res.writeHead(404).end('Not found');
  res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'text/plain' });
  fs.createReadStream(file).pipe(res);
});
function json(res, status, body) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body)); }
server.listen(PORT, () => console.log(`Signal is running at http://localhost:${PORT}`));
