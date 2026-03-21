-- multi-agent-kit — Supabase Schema
-- Run this in your Supabase SQL editor

-- Users (synced from Clerk via webhook)
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  clerk_id text unique not null,
  email text not null,
  plan text not null default 'free' check (plan in ('free', 'pro')),
  stripe_customer_id text,
  stripe_subscription_id text,
  created_at timestamptz default now()
);

-- Prompt variants (for RLHF bandit A/B testing)
create table if not exists prompt_variants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  content text not null,
  wins integer not null default 0,
  trials integer not null default 0,
  created_at timestamptz default now()
);

-- Seed default prompt variants
insert into prompt_variants (name, content) values
  ('default', 'You are a helpful, concise AI assistant. Answer clearly and directly.'),
  ('friendly', 'You are a warm and encouraging AI assistant. Be supportive, clear, and use simple language.'),
  ('expert', 'You are an expert AI assistant. Be precise, technical when needed, and cite reasoning.')
on conflict do nothing;

-- Conversations
create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  title text not null default 'New conversation',
  system_prompt_variant uuid references prompt_variants(id),
  created_at timestamptz default now()
);

-- Messages
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  token_count integer not null default 0,
  feedback smallint check (feedback in (1, -1)),  -- RLHF: 1=thumbs up, -1=thumbs down
  created_at timestamptz default now()
);

-- Daily usage logs
create table if not exists usage_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  tokens_used integer not null default 0,
  date date not null default current_date,
  unique(user_id, date)
);

-- Agent runs (observability + shared memory + cost tracking)
create table if not exists agent_runs (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  message_id uuid references messages(id) on delete set null,  -- link to the assistant message
  agent_id text not null,        -- 'researcher', 'coder', 'analyst', 'writer', 'planner'
  model text not null,           -- exact model used e.g. 'claude-sonnet-4-6'
  input text not null,           -- the user message routed to this agent
  context_snapshot text,         -- the full context (history + shared memory) given to agent
  output text not null,          -- agent's response
  routing_reason text,           -- why the router picked this agent
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cost_usd numeric(12, 8) not null default 0,  -- exact $ cost
  context_utilization integer default 0,        -- % of context window used (0-100)
  duration_ms integer default 0,               -- wall clock time in ms
  feedback smallint check (feedback in (1, -1)),
  created_at timestamptz default now()
);

-- Daily cost logs (aggregate per user per day)
create table if not exists cost_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  cost_usd numeric(12, 8) not null default 0,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  date date not null default current_date,
  unique(user_id, date)
);

-- Increment token usage
create or replace function increment_usage(p_user_id uuid, p_tokens integer)
returns void language plpgsql as $$
begin
  insert into usage_logs (user_id, tokens_used, date)
  values (p_user_id, p_tokens, current_date)
  on conflict (user_id, date)
  do update set tokens_used = usage_logs.tokens_used + p_tokens;
end;
$$;

-- Increment cost
create or replace function increment_cost(
  p_user_id uuid,
  p_cost_usd numeric,
  p_input_tokens integer,
  p_output_tokens integer
)
returns void language plpgsql as $$
begin
  insert into cost_logs (user_id, cost_usd, input_tokens, output_tokens, date)
  values (p_user_id, p_cost_usd, p_input_tokens, p_output_tokens, current_date)
  on conflict (user_id, date)
  do update set
    cost_usd = cost_logs.cost_usd + p_cost_usd,
    input_tokens = cost_logs.input_tokens + p_input_tokens,
    output_tokens = cost_logs.output_tokens + p_output_tokens;
end;
$$;

-- Get per-conversation cost (used by trace viewer)
create or replace function conversation_cost(p_conversation_id uuid)
returns numeric language sql stable as $$
  select coalesce(sum(cost_usd), 0) from agent_runs
  where conversation_id = p_conversation_id;
$$;

-- RLS policies (enable row level security)
alter table users enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table usage_logs enable row level security;
alter table prompt_variants enable row level security;
alter table agent_runs enable row level security;
alter table cost_logs enable row level security;

-- Service role bypasses RLS (used server-side)
create policy "service role full access" on users for all using (true);
create policy "service role full access" on conversations for all using (true);
create policy "service role full access" on messages for all using (true);
create policy "service role full access" on usage_logs for all using (true);
create policy "service role full access" on prompt_variants for all using (true);
create policy "service role full access" on agent_runs for all using (true);
create policy "service role full access" on cost_logs for all using (true);
