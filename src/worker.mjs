const GROQ_MODEL_DEFAULT = 'llama-3.1-8b-instant';

const demoItems = [
  { title: 'Open-weight models are moving from experimentation to production', source: 'Hugging Face Blog', publishedAt: isoHoursAgo(2), url: 'https://huggingface.co/blog', topics: ['Models', 'Open source'], summary: 'Hugging Face and open-model teams are making it easier for companies to run capable models on their own infrastructure. That lowers experimentation costs and gives enterprises more control over sensitive data. The trend keeps pressure on hosted AI providers to compete on price, reliability, and ease of deployment.', why: 'This changes the cost and control equation for enterprise AI adoption.', authority: 9, momentum: 8, novelty: 8 },
  { title: 'AI governance is becoming a product decision, not just a legal one', source: 'MIT Technology Review', publishedAt: isoHoursAgo(5), url: 'https://www.technologyreview.com/topic/artificial-intelligence/', topics: ['Policy', 'Safety'], summary: 'AI product teams are increasingly building traceability, user controls, and model evaluation into their roadmaps. Enterprise buyers are asking for these controls before they approve deployment. That makes governance a practical adoption requirement instead of a separate compliance memo.', why: 'Governance now affects which AI products actually get bought and deployed.', authority: 8, momentum: 7, novelty: 7 },
  { title: 'Agent tooling is focusing on reliability and evaluation', source: 'TechCrunch AI', publishedAt: isoHoursAgo(9), url: 'https://techcrunch.com/category/artificial-intelligence/', topics: ['Agents', 'Developer tools'], summary: 'AI agent products are moving toward guardrails, observability, and repeatable evaluation. The market is shifting from flashy demos to tools that can survive real business workflows. That is a maturity signal for practical automation beyond chat interfaces.', why: 'Reliable agents are the path from AI demos to measurable productivity.', authority: 7, momentum: 8, novelty: 8 }
];

let digestCache = makeDigest(demoItems, true);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const headers = { 'Cache-Control': 'no-store' };

    if (url.pathname === '/api/digest') {
      if (digestCache.demo || isOlderThan(digestCache.generatedAt, 12)) {
        try { digestCache = await refreshDigest(env); } catch {}
      }
      return json(digestCache, 200, headers);
    }

    if (url.pathname === '/api/status') {
      return json({ groq: Boolean(env.GROQ_API_KEY), telegram: Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) }, 200, headers);
    }

    if (url.pathname === '/api/refresh' && request.method === 'POST') {
      try {
        digestCache = await refreshDigest(env);
        return json(digestCache, 200, headers);
      } catch (error) {
        return json({ error: error.message }, 500, headers);
      }
    }

    if (url.pathname === '/api/send' && request.method === 'POST') {
      try {
        await sendTelegram(env, digestCache);
        return json({ ok: true }, 200, headers);
      } catch (error) {
        return json({ error: error.message }, 400, headers);
      }
    }

    return env.ASSETS.fetch(request);
  },

  async scheduled(_event, env, ctx) {
    ctx.waitUntil((async () => {
      const digest = await refreshDigest(env);
      digestCache = digest;
      if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) await sendTelegram(env, digest);
    })());
  }
};

function googleNewsFeed(name, query, authority = 7) {
  return { name, url: `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`, authority };
}

function buildSources(env) {
  const watchlist = (env.WATCHLIST || 'Kimi Moonshot,Qwen Alibaba,OpenAI Codex').split(',').map(item => item.trim()).filter(Boolean);
  return [
    googleNewsFeed('AI Breaking News', 'artificial intelligence when:3d', 8),
    googleNewsFeed('AI Markets & Capital', '(artificial intelligence OR AI) (markets OR funding OR investment OR stocks) when:3d', 8),
    googleNewsFeed('AI Hardware & Infrastructure', '(artificial intelligence OR AI) (hardware OR chips OR storage OR data center OR inference) when:3d', 8),
    googleNewsFeed('AI Enterprise & Productivity', '(artificial intelligence OR AI) (enterprise OR productivity OR deployment OR workforce) when:3d', 8),
    ...watchlist.map(term => googleNewsFeed(`Watchlist: ${term}`, `${term} artificial intelligence when:30d`, 8)),
    { name: 'OpenAI News', url: 'https://openai.com/news/rss.xml', authority: 10 },
    { name: 'Hugging Face Blog', url: 'https://huggingface.co/blog/feed.xml', authority: 9 },
    { name: 'MIT Technology Review', url: 'https://www.technologyreview.com/feed/', authority: 8 },
    { name: 'Google AI Updates', url: 'https://blog.google/feed/', authority: 9 },
    { name: 'Ars Technica AI', url: 'https://feeds.arstechnica.com/arstechnica/technology-lab', authority: 8 },
    { name: 'TechCrunch AI', url: 'https://techcrunch.com/category/artificial-intelligence/feed/', authority: 7 }
  ];
}

async function refreshDigest(env) {
  const sources = buildSources(env);
  const results = await Promise.allSettled(sources.map(async source => parseFeed(await (await fetch(source.url, { headers: { 'User-Agent': 'Signal-AI-Briefing/0.1' } })).text(), source)));
  const raw = results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
  const unique = [...new Map(raw.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt)).map(i => [dedupeKey(i.title), i])).values()];
  const onePerSource = sources.map(source => unique.find(item => item.source === source.name)).filter(Boolean);
  const candidates = [...new Map([...onePerSource, ...unique].map(item => [dedupeKey(item.title), item])).values()].slice(0, 10);
  const enriched = [];

  for (const item of candidates) {
    try { enriched.push(env.GROQ_API_KEY ? await groqEnrich(env, item) : heuristicEnrich(item)); } catch { enriched.push(heuristicEnrich(item)); }
  }

  const accepted = enriched.filter(i => i.isAI);
  return makeDigest(accepted.length ? accepted : demoItems, !env.GROQ_API_KEY, sources);
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

async function groqEnrich(env, item) {
  const prompt = `You are the editor of an AI intelligence briefing for a business reader. Include only stories that materially affect AI: model or research breakthroughs; AI hardware, chips, storage, data centers or inference; AI markets, funding, public-company impact or capital; enterprise deployment, product adoption, workforce or measurable productivity; and policy/safety. Exclude generic tech or marketing news. Write a factual news brief, never a vague overview. The first sentence MUST name the central company, model, product, or organization from the source title and say exactly what happened. Include concrete details from the source when available. Do not invent facts. Return ONLY JSON with isAI (boolean), summary (an array of exactly 3 concise sentences), why (one specific sentence), topics (array chosen from Models, Research, Policy, Safety, Agents, Open source, Developer tools, Startups, Markets, Hardware, Infrastructure, Enterprise, Productivity), importance (0-10), marketImpact (0-10), enterpriseImpact (0-10), breakthrough (0-10).\nSOURCE HEADLINE: ${item.title}\nSOURCE TEXT: ${(item.raw || '').slice(0, 4500)}`;
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${env.GROQ_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: env.GROQ_MODEL || GROQ_MODEL_DEFAULT, temperature: 0.2, response_format: { type: 'json_object' }, messages: [{ role: 'user', content: prompt }] }) });
  if (!response.ok) throw new Error(`Groq ${response.status}`);
  const body = await response.json();
  const generated = JSON.parse(body.choices[0].message.content);
  if (Array.isArray(generated.summary)) generated.summary = generated.summary.join(' ');
  if (Array.isArray(generated.why)) generated.why = generated.why.join(' ');
  return { ...item, ...generated, title: item.title };
}

function heuristicEnrich(item) {
  const text = `${item.title} ${item.raw || ''}`.toLowerCase();
  const isAI = /\b(ai|artificial intelligence|model|llm|machine learning|openai|anthropic|deepmind|agent|kimi|qwen|codex)\b/.test(text);
  const topics = [];
  if (/policy|regulat|law|safety/.test(text)) topics.push('Policy');
  if (/research|paper|benchmark/.test(text)) topics.push('Research');
  if (/open.source|open.weight/.test(text)) topics.push('Open source');
  if (/agent/.test(text)) topics.push('Agents');
  if (/startup|funding|raise/.test(text)) topics.push('Startups');
  if (/chip|gpu|hardware|storage|ssd|data center|inference/.test(text)) topics.push('Hardware');
  if (/market|stock|funding|investment|valuation|revenue/.test(text)) topics.push('Markets');
  if (/enterprise|productivity|deploy|workforce/.test(text)) topics.push('Enterprise');
  return { ...item, isAI, topics: topics.length ? topics : ['AI'], summary: (item.raw || item.title).slice(0, 300), why: 'Selected for freshness and AI relevance.', importance: 5, marketImpact: topics.includes('Markets') ? 6 : 0, enterpriseImpact: topics.includes('Enterprise') ? 6 : 0, breakthrough: topics.includes('Hardware') || topics.includes('Research') ? 5 : 0 };
}

function rank(item) {
  const ageHours = (Date.now() - new Date(item.publishedAt).getTime()) / 3600000;
  const freshness = Math.max(0, 20 - ageHours * 0.7);
  const AIjudgment = (Number(item.importance) || 5) * 2 + (Number(item.marketImpact) || 0) * 1.4 + (Number(item.enterpriseImpact) || 0) * 1.4 + (Number(item.breakthrough) || 0) * 1.2;
  return Math.round(Math.min(100, item.authority * 2.3 + item.momentum * 2.2 + item.novelty * 1.8 + freshness + AIjudgment));
}

function makeDigest(items, demo = false, sources = buildSources({})) {
  const scored = items.map(item => ({ ...item, score: rank(item) })).sort((a, b) => b.score - a.score);
  return { generatedAt: new Date().toISOString(), demo, provider: demo ? 'Built-in fallback' : 'Groq', sources: sources.map(s => s.name), trending: scored.slice(0, 3), more: scored.slice(3) };
}

async function sendTelegram(env, data) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) throw new Error('Add TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID first.');
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: telegramText(data), parse_mode: 'Markdown', disable_web_page_preview: true }) });
  if (!response.ok) throw new Error(`Telegram ${response.status}`);
}

function telegramText(data) {
  const lines = ['*Signal - AI Daily Briefing*', '', '*Trending today*'];
  for (const item of data.trending) lines.push(`\n*${item.title}*\n${item.summary}\n[Read more](${item.url})`);
  if (data.more.length) {
    lines.push('\n*More AI news*');
    for (const item of data.more) lines.push(`- [${item.title}](${item.url})`);
  }
  return lines.join('\n');
}

function isoHoursAgo(hours) { return new Date(Date.now() - hours * 3600000).toISOString(); }
function isOlderThan(date, hours) { return (Date.now() - new Date(date).getTime()) > hours * 3600000; }
function dedupeKey(title) { return title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 80); }
function stripHtml(s = '') { return s.replace(/<[^>]*>/g, ' ').replace(/&[^;]+;/g, ' ').replace(/\s+/g, ' ').trim(); }
function json(body, status = 200, headers = {}) { return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers } }); }
