# Signal — AI Daily Briefing

A free, local-first MVP that collects AI news from public RSS feeds, removes duplicates, ranks stories, and presents a daily briefing. It works immediately in **demo mode**, and becomes AI-enriched when you add a Groq API key.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/deniselin-dev/signal-ai-briefing)

## Run locally

Use the bundled Node runtime provided by Codex:

```sh
/Users/deniselin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node server.mjs
```

Then open `http://localhost:4173`.

## What you need to enable live features

Copy `.env.example` to `.env` and add only the credentials you want:

| Feature | Required value | Where to get it |
| --- | --- | --- |
| AI relevance and summaries | `GROQ_API_KEY` | Groq Console API Keys |
| Telegram delivery | Add later, after deploy | Create a bot via @BotFather; send it a message, then get your chat ID |

The default `GROQ_MODEL` is `llama-3.1-8b-instant`, selected for low-cost relevance filtering and concise summaries. It is configurable so the app can be moved to a newer low-cost Groq model later without code changes.

No API key is required to view the interface or its seeded briefing.

## Workflow

1. Press **Refresh sources** to fetch public RSS feeds.
2. If `GROQ_API_KEY` is present, Groq checks relevance and produces structured summaries.
3. The local ranking system prioritizes freshness, source authority, momentum, novelty and your selected interests.
4. Use **Send test digest** after adding Telegram credentials.

## GitHub and free Cloudflare hosting

This project is ready to publish as a public GitHub repository and deploy as a Cloudflare Worker with Static Assets.

The Cloudflare version lives in `src/worker.mjs`. It serves the dashboard from `public/`, refreshes the news from `/api/refresh`, and includes a scheduled daily run in `wrangler.jsonc`.

The cron schedule is:

```json
"crons": ["0 0 * * *"]
```

Cloudflare runs cron triggers in UTC, so this means 8:00 AM Singapore time. Change it to `0 1 * * *` for 9:00 AM Singapore time.

Deploy with:

```sh
npm run cloudflare:deploy
```

Then add the Groq secret in Cloudflare:

```sh
npm run cloudflare:secret:groq
```

Only `GROQ_API_KEY` is required for AI summaries. Telegram secrets are optional and should be skipped until you actually create a Telegram bot.

## Notes

- RSS is deliberately preferred over unrestricted scraping: it is more reliable and considerate of publishers.
- Current free sources: OpenAI News, Hugging Face Blog, MIT Technology Review, Google AI Updates, Ars Technica AI, TechCrunch AI, broad Google News AI feeds, and targeted Google News RSS priority watches. No news API key is required.
- The default coverage is broad by design: models and labs, research benchmarks, multimodal AI, agents and developer tools, chips, data centers, power, inference infrastructure, enterprise adoption, productivity, funding, markets, policy, safety, and lawsuits.
- The ranking is intentionally business-aware: it favors material breakthroughs plus market impact, AI hardware/infrastructure, enterprise adoption, and demonstrated productivity effects.
- Edit `WATCHLIST` in `YOUR_API_KEYS.env` to boost specific companies, models, or topics you care about. It is a "do not miss" list, not a limit on coverage.
- The app includes a transparent fallback summarizer so it remains usable without an LLM; it labels that state clearly.
- Never commit `.env`.
