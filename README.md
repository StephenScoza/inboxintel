# InboxIntel

InboxIntel is a read-only Gmail intelligence MVP built with TypeScript, Express, Prisma, Postgres, and Docker. It ingests messages from one Gmail account, stores them locally, classifies them with deterministic rules, and sends Discord webhook alerts for high-signal events.

## V1 Safety

InboxIntel V1 is strictly read-only.

- It only requests the Gmail scope `https://www.googleapis.com/auth/gmail.readonly`.
- It never deletes, archives, labels, unsubscribes, or modifies Gmail content.
- Any future destructive action should require explicit manual approval.

## Stack

- TypeScript + Node.js
- Express server-rendered dashboard
- Prisma ORM
- Postgres
- Docker + docker-compose
- Gmail API with OAuth
- Discord webhooks

## 1. Set up Google Cloud Gmail API

1. Open the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project for InboxIntel.
3. Enable the Gmail API for that project.
4. Go to `APIs & Services -> OAuth consent screen`.
5. Configure the app as an external app for local testing.
6. Add your Gmail address as a test user if Google requires it.

## 2. Create OAuth credentials

1. Go to `APIs & Services -> Credentials`.
2. Create an `OAuth client ID`.
3. Choose `Web application`.
4. Add this redirect URI for local development:
   - `http://localhost:3217/oauth2callback`
5. Copy the client ID and client secret into your `.env`.

InboxIntel only uses this Gmail scope:

- `https://www.googleapis.com/auth/gmail.readonly`

## 3. Configure environment variables

1. Copy `.env.example` to `.env`.
2. Fill in:
   - `DATABASE_URL`
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `GOOGLE_REDIRECT_URI`
   - Discord webhook URLs
   - optional host port overrides like `PORT` and `POSTGRES_HOST_PORT`

If you do not want a given alert channel yet, you can leave that webhook blank.

Default local ports are intentionally project-specific so InboxIntel can live alongside other apps:

- Web app: `3217`
- Postgres host port: `55432`

You can change either one in `.env`.

## 4. Run Docker

Start Postgres and the app:

```bash
docker compose up --build
```

The dashboard will be available at [http://localhost:3217](http://localhost:3217) by default.

## 5. Run Prisma migrations

The app container runs Prisma deploy migrations on startup. You can also run them manually:

```bash
docker compose exec app npm run prisma:migrate
```

If you want Prisma Studio:

```bash
docker compose exec app npm run prisma:studio
```

## 6. Authenticate Gmail

Run the OAuth helper inside the app container:

```bash
docker compose exec app npm run gmail:auth
```

What happens:

1. InboxIntel prints a Google consent URL.
2. Open the URL in your browser.
3. Sign in to the Gmail account you want InboxIntel to read.
4. Google redirects back to `http://localhost:3217/oauth2callback` by default.
5. Copy the full redirected URL from the browser and paste it into the terminal prompt.
6. InboxIntel stores the token JSON in the local `tokens/` directory.

`tokens/` is intentionally gitignored.

## 7. Ingest emails

Run a one-time ingest:

```bash
docker compose exec app npm run ingest
```

Run the worker loop:

```bash
docker compose exec app npm run worker
```

The worker periodically fetches Gmail messages in pages, stores new emails, classifies them, updates subscriptions, and writes alerts.

If you improve the deterministic rules and want to re-run them against emails already stored in Postgres without calling Gmail again:

```bash
docker compose exec app npm run reprocess
```

You can also reprocess a limited slice while tuning:

```bash
docker compose exec app npm run reprocess -- --limit=100
```

The reprocess job refreshes stored extracted amounts, extracted dates, classifications, subscription facts, and creates any newly eligible alerts that do not already exist for an email.

## 8. View the dashboard

Available routes:

- `/emails`
- `/emails/:id`
- `/senders`
- `/subscriptions`
- `/alerts`
- `/classifications`
- `/health`

## 9. Classification behavior

Classification is deterministic only. InboxIntel does not call any AI API.

Examples:

- `trial ends`, `free trial`, `your trial` -> `FREE_TRIAL`
- `renews on`, `renewal date`, `next billing date` -> `RENEWAL_NOTICE`
- `you were charged`, `receipt`, `invoice`, `payment received` -> `PAYMENT_RECEIPT`
- `price increase`, `updated pricing` -> `PRICE_INCREASE`
- `payment failed`, `billing issue`, `update payment method` -> `FAILED_PAYMENT`
- `raffle`, `giveaway`, `draw closes`, `enter to win` -> `RAFFLE_OR_GIVEAWAY`
- `shipped`, `tracking`, `delivered`, `order confirmation` -> `ORDER_OR_SHIPPING`
- `security alert`, `new login`, `password changed` -> `ACCOUNT_SECURITY`

## Local development notes

- The app is intentionally simple and monolithic for a solo-dev MVP.
- Gmail access is single-account in V1.
- Duplicate prevention uses `gmailMessageId`.
- All alerts are saved in Postgres even if a Discord webhook is not configured.

Run the deterministic intelligence tests with:

```bash
npm test
```
