/**
 * AgentKit — RLHF Bandit
 *
 * Thompson Sampling bandit over system prompt variants.
 * Each prompt variant has (wins, trials). When a user gives
 * thumbs up on a message, that variant's wins increments.
 * The bandit samples Beta(wins+1, losses+1) for each variant
 * and picks the one with the highest sample — exploration vs exploitation.
 */

import { supabase } from './supabase'

// Sample from Beta distribution using the Johnk method
function sampleBeta(alpha: number, beta: number): number {
  // Use normal approximation for large params (fast, good enough)
  if (alpha > 5 && beta > 5) {
    const mean = alpha / (alpha + beta)
    const variance = (alpha * beta) / ((alpha + beta) ** 2 * (alpha + beta + 1))
    return Math.max(0, Math.min(1, mean + Math.sqrt(variance) * (Math.random() * 2 - 1) * 1.5))
  }
  // Exact sampling for small params
  let x = 0, y = 0
  do { x = Math.pow(Math.random(), 1 / alpha) } while (x === 0)
  do { y = Math.pow(Math.random(), 1 / beta) } while (y === 0)
  return x / (x + y)
}

// Pick the best prompt variant using Thompson Sampling
export async function selectPromptVariant(): Promise<{ id: string; content: string }> {
  const { data: variants } = await supabase
    .from('prompt_variants')
    .select('id, content, wins, trials')

  if (!variants || variants.length === 0) {
    return {
      id: 'default',
      content: 'You are a helpful, concise AI assistant.',
    }
  }

  let bestVariant = variants[0]
  let bestSample = -1

  for (const variant of variants) {
    const wins = variant.wins ?? 0
    const losses = (variant.trials ?? 0) - wins
    const sample = sampleBeta(wins + 1, Math.max(losses + 1, 1))
    if (sample > bestSample) {
      bestSample = sample
      bestVariant = variant
    }
  }

  return { id: bestVariant.id, content: bestVariant.content }
}

// Record feedback for a message and update the bandit
export async function recordFeedback(messageId: string, feedback: 1 | -1): Promise<void> {
  // Get the message → conversation → prompt variant
  const { data: message } = await supabase
    .from('messages')
    .select('conversation_id')
    .eq('id', messageId)
    .single()

  if (!message) return

  const { data: conversation } = await supabase
    .from('conversations')
    .select('system_prompt_variant')
    .eq('id', message.conversation_id)
    .single()

  if (!conversation?.system_prompt_variant) return

  const variantId = conversation.system_prompt_variant

  // Update message feedback
  await supabase
    .from('messages')
    .update({ feedback })
    .eq('id', messageId)

  // Update bandit stats
  const { data: variant } = await supabase
    .from('prompt_variants')
    .select('wins, trials')
    .eq('id', variantId)
    .single()

  if (!variant) return

  await supabase
    .from('prompt_variants')
    .update({
      wins: feedback === 1 ? variant.wins + 1 : variant.wins,
      trials: variant.trials + 1,
    })
    .eq('id', variantId)
}

// Get bandit stats for dashboard
export async function getBanditStats() {
  const { data: variants } = await supabase
    .from('prompt_variants')
    .select('name, wins, trials')
    .order('wins', { ascending: false })

  return (variants ?? []).map(v => ({
    name: v.name,
    wins: v.wins,
    trials: v.trials,
    winRate: v.trials > 0 ? Math.round((v.wins / v.trials) * 100) : 0,
  }))
}
