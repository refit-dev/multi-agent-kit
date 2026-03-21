# AgentKit — AI SaaS Boilerplate

> Ship your AI product this weekend, not this month.

The only Next.js boilerplate with a **built-in RLHF feedback loop**. Every time a user gives a thumbs up or down, a Thompson sampling bandit learns which system prompt performs best — automatically.

## What's included

| Feature | Details |
|---|---|
| 🔐 Auth | Clerk — sign in/up, protected routes, user webhooks |
| 💳 Payments | Stripe — Free + Pro subscriptions, checkout, billing portal |
| 🧠 Memory | Conversation history in Postgres. Auto-summarizes when context window gets long |
| 🔄 RLHF loop | Thumbs up/down → Thompson sampling bandit → best prompt wins |
| ⚡ Streaming | Claude claude-sonnet-4-6 via SSE. Token counting per message |
| 🛡️ Rate limiting | Upstash Redis. Free: 10 msgs/day. Pro: 200 msgs/day |
| 📊 Dashboard | Usage stats, bandit win rates, plan management |
| 🚀 Deploy | Vercel-ready |

## Stack

Next.js 15 · TypeScript · Tailwind · shadcn/ui · Clerk · Supabase · Stripe · Anthropic Claude · Upstash Redis

## Setup (< 20 minutes)

### 1. Clone and install

```bash
git clone https://github.com/yourusername/agentkit
cd agentkit
npm install
cp .env.example .env.local
```

### 2. Clerk (Auth)

1. Create project at [clerk.com](https://clerk.com)
2. Copy `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`
3. Webhooks → Add endpoint: `https://yourdomain.com/api/webhooks/clerk`
4. Events: `user.created`, `user.deleted` → copy signing secret to `CLERK_WEBHOOK_SECRET`

### 3. Supabase (Database)

1. Create project at [supabase.com](https://supabase.com)
2. SQL Editor → paste and run `lib/schema.sql`
3. Copy URL and keys to `.env.local`

### 4. Stripe (Payments)

1. Create recurring price at $19/month → copy `STRIPE_PRO_PRICE_ID`
2. Copy publishable + secret keys
3. Local: `stripe listen --forward-to localhost:3000/api/webhooks/stripe`

### 5. Anthropic

Get API key at [console.anthropic.com](https://console.anthropic.com)

### 6. Upstash Redis

Create free database at [upstash.com](https://upstash.com)

### 7. Run

```bash
npm run dev
```

## How the RLHF loop works

1. Every assistant message has a 👍 / 👎 button
2. Feedback is stored per message in Postgres
3. A **Thompson Sampling bandit** tracks wins/trials per system prompt variant
4. New conversations automatically get the variant with the highest sampled reward
5. Dashboard shows win rates in real time

Your AI product gets measurably better as users interact with it — zero manual prompt tweaking.

## Customizing prompts

Add new variants in Supabase:

```sql
insert into prompt_variants (name, content) values
  ('my_variant', 'You are a specialized assistant for...');
```

The bandit starts testing it automatically.

## Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new)

Push to GitHub → Import to Vercel → Add env vars → Deploy.

## Pricing model (included)

- Free: 10 msgs/day, limited memory → drives signups
- Pro ($19/month): 200 msgs/day, full persistent memory → revenue

Edit limits in `lib/rate-limit.ts`.

## License

MIT. Star the repo if it saved you time.

---

Built in 48 hours. Open source.
