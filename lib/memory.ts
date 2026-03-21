import Anthropic from '@anthropic-ai/sdk'
import { supabase, type Message } from './supabase'

const client = new Anthropic()

const FREE_MEMORY_LIMIT = 10   // messages free users can recall
const MAX_CONTEXT_TOKENS = 6000 // summarize when above this

// Load conversation history, respecting plan limits
export async function loadMemory(
  conversationId: string,
  plan: 'free' | 'pro'
): Promise<{ role: 'user' | 'assistant'; content: string }[]> {
  const limit = plan === 'pro' ? 100 : FREE_MEMORY_LIMIT

  const { data: messages } = await supabase
    .from('messages')
    .select('role, content, token_count')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (!messages || messages.length === 0) return []

  const history = messages.reverse() as Pick<Message, 'role' | 'content' | 'token_count'>[]

  // Summarize if context is getting too large (pro only — free just truncates)
  const totalTokens = history.reduce((sum, m) => sum + m.token_count, 0)
  if (plan === 'pro' && totalTokens > MAX_CONTEXT_TOKENS) {
    return await summarizeOldMessages(history)
  }

  return history.map(m => ({ role: m.role, content: m.content }))
}

// Condense old messages into a summary to preserve context window
async function summarizeOldMessages(
  messages: Pick<Message, 'role' | 'content' | 'token_count'>[]
): Promise<{ role: 'user' | 'assistant'; content: string }[]> {
  const cutoff = Math.floor(messages.length * 0.6)
  const toSummarize = messages.slice(0, cutoff)
  const recent = messages.slice(cutoff)

  const summaryResponse = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    messages: [
      {
        role: 'user',
        content: `Summarize this conversation in 2-3 sentences, preserving key facts and context:\n\n${toSummarize
          .map(m => `${m.role}: ${m.content}`)
          .join('\n')}`,
      },
    ],
  })

  const summary = summaryResponse.content[0].type === 'text'
    ? summaryResponse.content[0].text
    : ''

  return [
    { role: 'user', content: '[Earlier conversation summary]' },
    { role: 'assistant', content: summary },
    ...recent.map(m => ({ role: m.role, content: m.content })),
  ]
}

// Count tokens (rough estimate: 1 token ≈ 4 chars)
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

// Save a message to DB
export async function saveMessage(params: {
  conversationId: string
  role: 'user' | 'assistant'
  content: string
}): Promise<string> {
  const { data } = await supabase
    .from('messages')
    .insert({
      conversation_id: params.conversationId,
      role: params.role,
      content: params.content,
      token_count: estimateTokens(params.content),
    })
    .select('id')
    .single()

  return data?.id ?? ''
}
