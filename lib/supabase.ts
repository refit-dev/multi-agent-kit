import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const supabaseAnon = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// ── Types ──────────────────────────────────────────────────────────────────

export type Plan = 'free' | 'pro'

export interface DBUser {
  id: string
  clerk_id: string
  email: string
  plan: Plan
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  created_at: string
}

export interface Conversation {
  id: string
  user_id: string
  title: string
  system_prompt_variant: string  // for bandit A/B testing
  created_at: string
}

export interface Message {
  id: string
  conversation_id: string
  role: 'user' | 'assistant'
  content: string
  token_count: number
  feedback: 1 | -1 | null  // RLHF: thumbs up/down
  created_at: string
}

export interface UsageLog {
  id: string
  user_id: string
  tokens_used: number
  date: string  // YYYY-MM-DD
}

export interface PromptVariant {
  id: string
  name: string
  content: string
  wins: number    // bandit: positive feedback count
  trials: number  // bandit: total times used
  created_at: string
}
