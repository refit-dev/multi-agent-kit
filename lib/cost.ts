/**
 * multi-agent-kit — Cost Calculator
 *
 * Tracks real $ cost per agent run using Anthropic's actual pricing.
 * Input and output tokens are priced differently — this matters a lot
 * because multi-agent systems use 15x more tokens than single-agent chat.
 *
 * Pricing as of 2026 (update PRICING if Anthropic changes rates):
 * https://www.anthropic.com/pricing
 */

// ── Pricing Table ─────────────────────────────────────────────────────────────

interface ModelPricing {
  inputPerMillion: number   // $ per 1M input tokens
  outputPerMillion: number  // $ per 1M output tokens
}

const PRICING: Record<string, ModelPricing> = {
  'claude-opus-4-6':            { inputPerMillion: 15.00, outputPerMillion: 75.00 },
  'claude-sonnet-4-6':          { inputPerMillion: 3.00,  outputPerMillion: 15.00 },
  'claude-haiku-4-5-20251001':  { inputPerMillion: 0.80,  outputPerMillion: 4.00  },
  // Fallback for unknown models
  'default':                    { inputPerMillion: 3.00,  outputPerMillion: 15.00 },
}

// ── Core Calculator ───────────────────────────────────────────────────────────

export function calculateCost(params: {
  model: string
  inputTokens: number
  outputTokens: number
}): number {
  const pricing = PRICING[params.model] ?? PRICING['default']
  const inputCost = (params.inputTokens / 1_000_000) * pricing.inputPerMillion
  const outputCost = (params.outputTokens / 1_000_000) * pricing.outputPerMillion
  return inputCost + outputCost
}

// ── Formatting Helpers ────────────────────────────────────────────────────────

export function formatCost(usd: number): string {
  if (usd < 0.001) return `< $0.001`
  if (usd < 0.01)  return `$${usd.toFixed(4)}`
  if (usd < 1)     return `$${usd.toFixed(3)}`
  return `$${usd.toFixed(2)}`
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`
  return `${n}`
}

// ── Context Window Awareness ──────────────────────────────────────────────────
// Warn when agent is using a large % of its context window

const CONTEXT_WINDOWS: Record<string, number> = {
  'claude-opus-4-6':           200_000,
  'claude-sonnet-4-6':         200_000,
  'claude-haiku-4-5-20251001': 200_000,
  'default':                   200_000,
}

export function contextUtilization(model: string, inputTokens: number): number {
  const window = CONTEXT_WINDOWS[model] ?? CONTEXT_WINDOWS['default']
  return Math.round((inputTokens / window) * 100)
}

// ── Daily Budget Helpers ──────────────────────────────────────────────────────

export const DAILY_BUDGET_USD = {
  free: 0.10,  // $0.10/day for free users
  pro:  2.00,  // $2.00/day for pro users
}

export function budgetStatus(spent: number, plan: 'free' | 'pro'): {
  percent: number
  warning: boolean
  exceeded: boolean
} {
  const budget = DAILY_BUDGET_USD[plan]
  const percent = Math.round((spent / budget) * 100)
  return {
    percent: Math.min(percent, 100),
    warning: percent >= 80,
    exceeded: percent >= 100,
  }
}
