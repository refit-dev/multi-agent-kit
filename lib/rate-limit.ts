import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { supabase } from './supabase'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

// Free: 10 requests/day. Pro: 200 requests/day.
const freeLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, '24 h'),
  prefix: 'agentkit:free',
})

const proLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(200, '24 h'),
  prefix: 'agentkit:pro',
})

export async function checkRateLimit(
  userId: string,
  plan: 'free' | 'pro'
): Promise<{ allowed: boolean; remaining: number; reset: number }> {
  const limiter = plan === 'pro' ? proLimiter : freeLimiter
  const { success, remaining, reset } = await limiter.limit(userId)
  return { allowed: success, remaining, reset }
}

// Track token usage in Supabase for billing/analytics
export async function trackTokenUsage(userId: string, tokens: number): Promise<void> {
  await supabase.rpc('increment_usage', { p_user_id: userId, p_tokens: tokens })
}
