# Deploy Signal AI Briefing

This repo is ready for two things:

1. A public GitHub repository, so it shows activity on your profile.
2. A Cloudflare Worker, so the dashboard is hosted online and refreshes daily.

## What Codex already set up

- `src/worker.mjs` is the Cloudflare-hosted version of the app.
- `wrangler.jsonc` tells Cloudflare how to serve the dashboard and when to run the daily cron.
- `public/` contains the homepage you will read every day.
- `.env.example` and `.dev.vars.example` show which keys are needed without exposing your real keys.

## Daily schedule

The cron job is in `wrangler.jsonc`:

```json
"crons": ["0 0 * * *"]
```

Cloudflare uses UTC. `0 0 * * *` means 8:00 AM in Singapore.

## Secrets to add in Cloudflare

Required:

```txt
GROQ_API_KEY
```

Optional later for Telegram delivery:

```txt
TELEGRAM_BOT_TOKEN
TELEGRAM_CHAT_ID
```

Already configured as non-secret settings:

```txt
GROQ_MODEL=llama-3.1-8b-instant
WATCHLIST=Kimi Moonshot,Qwen Alibaba,OpenAI Codex
```

## GitHub blocker on this Mac

The project has a `.git` folder, but macOS is currently blocking Git because Xcode Command Line Tools are missing.

Fix:

```sh
xcode-select --install
```

After that, Codex can help create the public GitHub repo and push this folder.

## Cloudflare deploy

After Git works, deploy with:

```sh
npm run cloudflare:deploy
```

Then add the secrets:

```sh
npm run cloudflare:secret:groq
```

Skip Telegram secrets until you intentionally set up a Telegram bot.
