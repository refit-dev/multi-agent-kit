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

-- Agent runs (observability + shared memory across agents)
create table if not exists agent_runs (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  agent_id text not null,   -- 'researcher', 'coder', 'analyst', 'writer', 'planner'
  input text not null,
  output text not null,
  token_count integer not null default 0,
  feedback smallint check (feedback in (1, -1)),
  created_at timestamptz default now()
);

-- Increment usage helper function
create or replace function increment_usage(p_user_id uuid, p_tokens integer)
returns void language plpgsql as $$
begin
  insert into usage_logs (user_id, tokens_used, date)
  values (p_user_id, p_tokens, current_date)
  on conflict (user_id, date)
  do update set tokens_used = usage_logs.tokens_used + p_tokens;
end;
$$;

-- RLS policies (enable row level security)
alter table users enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table usage_logs enable row level security;
alter table prompt_variants enable row level security;
alter table agent_runs enable row level security;

-- Service role bypasses RLS (used server-side)
create policy "service role full access" on users for all using (true);
create policy "service role full access" on conversations for all using (true);
create policy "service role full access" on messages for all using (true);
create policy "service role full access" on usage_logs for all using (true);
create policy "service role full access" on prompt_variants for all using (true);
create policy "service role full access" on agent_runs for all using (true);
