/**
 * multi-agent-kit — Agent Definitions, Router & Observability
 *
 * Architecture:
 * 1. RouterAgent picks the best specialist (Haiku — fast, cheap)
 * 2. Specialist runs with its own system prompt + shared context from prior agents
 * 3. Every run is stored in agent_runs with real token counts + $ cost
 * 4. The trace viewer reads agent_runs to show exactly what happened
 */

import Anthropic from '@anthropic-ai/sdk'
import { supabase } from './supabase'
import { calculateCost, contextUtilization } from './cost'

const client = new Anthropic()

// ── Agent Registry ────────────────────────────────────────────────────────────

export interface AgentDefinition {
  id: string
  name: string
  emoji: string
  description: string   // used by router to decide who to call
  systemPrompt: string
  model: string
  maxTokens: number
}

export const AGENTS: AgentDefinition[] = [
  {
    id: 'researcher',
    name: 'Researcher',
    emoji: '🔍',
    description: 'Finds information, summarizes knowledge, answers factual or explanatory questions',
    systemPrompt: `You are a research specialist. Your job is to find and synthesize information clearly and accurately.
Be thorough but concise. Structure complex answers with headers when helpful. Cite your reasoning.`,
    model: 'claude-sonnet-4-6',
    maxTokens: 1024,
  },
  {
    id: 'coder',
    name: 'Coder',
    emoji: '💻',
    description: 'Writes, reviews, debugs, and explains code in any programming language',
    systemPrompt: `You are an expert software engineer. Write clean, production-ready code with clear explanations.
Always explain what the code does and why. Use code blocks. Point out edge cases and potential bugs.`,
    model: 'claude-sonnet-4-6',
    maxTokens: 2048,
  },
  {
    id: 'analyst',
    name: 'Analyst',
    emoji: '📊',
    description: 'Analyzes situations, evaluates trade-offs, makes decisions, compares options',
    systemPrompt: `You are a critical thinking analyst. Break down complex problems systematically.
List pros/cons, quantify where possible, and give a clear recommendation with reasoning.`,
    model: 'claude-sonnet-4-6',
    maxTokens: 1024,
  },
  {
    id: 'writer',
    name: 'Writer',
    emoji: '✍️',
    description: 'Writes and edits content — emails, docs, blog posts, copy, summaries, messages',
    systemPrompt: `You are a professional writer and editor. Write clearly, concisely, and with appropriate tone.
Match the user's voice when editing. Make content compelling and easy to read.`,
    model: 'claude-sonnet-4-6',
    maxTokens: 2048,
  },
  {
    id: 'planner',
    name: 'Planner',
    emoji: '📋',
    description: 'Breaks down complex tasks, creates step-by-step plans, roadmaps, and action items',
    systemPrompt: `You are a strategic planner. Break ambiguous goals into clear, actionable steps.
Create concrete plans with priorities, dependencies, and success criteria. Use numbered lists.`,
    model: 'claude-haiku-4-5-20251001',
    maxTokens: 1024,
  },
]

// ── Router ────────────────────────────────────────────────────────────────────

export async function routeToAgent(
  message: string,
  history: { role: 'user' | 'assistant'; content: string }[]
): Promise<{ agent: AgentDefinition; reason: string }> {
  const agentList = AGENTS.map(a => `${a.id}: ${a.description}`).join('\n')

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 100,
    system: `You are a routing agent. Pick the best specialist for the user's message.
Respond with JSON only: {"agent": "<agent_id>", "reason": "<one sentence why>"}
Available agents:\n${agentList}`,
    messages: [
      ...history.slice(-4),
      { role: 'user', content: message },
    ],
  })

  try {
    const text = response.content[0].type === 'text' ? response.content[0].text : '{}'
    const parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? '{}')
    const agent = AGENTS.find(a => a.id === parsed.agent) ?? AGENTS[0]
    return { agent, reason: parsed.reason ?? 'Best match for this request' }
  } catch {
    return { agent: AGENTS[0], reason: 'Default routing' }
  }
}

// ── Shared Agent Memory ───────────────────────────────────────────────────────

export async function loadAgentHistory(conversationId: string): Promise<string> {
  const { data: runs } = await supabase
    .from('agent_runs')
    .select('agent_id, input, output, cost_usd, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(10)

  if (!runs || runs.length === 0) return ''

  return runs
    .map(r => `[${r.agent_id.toUpperCase()} AGENT — $${Number(r.cost_usd).toFixed(4)}]\nTask: ${r.input}\nResult: ${r.output}`)
    .join('\n\n---\n\n')
}

// ── Store Agent Run (with real token counts + cost) ───────────────────────────

export async function storeAgentRun(params: {
  conversationId: string
  messageId: string
  agentId: string
  model: string
  input: string
  contextSnapshot: string
  output: string
  routingReason: string
  inputTokens: number
  outputTokens: number
  durationMs: number
}): Promise<string> {
  const costUsd = calculateCost({
    model: params.model,
    inputTokens: params.inputTokens,
    outputTokens: params.outputTokens,
  })

  const ctxUtil = contextUtilization(params.model, params.inputTokens)

  const { data } = await supabase
    .from('agent_runs')
    .insert({
      conversation_id: params.conversationId,
      message_id: params.messageId,
      agent_id: params.agentId,
      model: params.model,
      input: params.input,
      context_snapshot: params.contextSnapshot,
      output: params.output,
      routing_reason: params.routingReason,
      input_tokens: params.inputTokens,
      output_tokens: params.outputTokens,
      cost_usd: costUsd,
      context_utilization: ctxUtil,
      duration_ms: params.durationMs,
    })
    .select('id')
    .single()

  return data?.id ?? ''
}

// ── Observability Queries ─────────────────────────────────────────────────────

export async function getAgentStats(userId: string) {
  const { data: conversations } = await supabase
    .from('conversations')
    .select('id')
    .eq('user_id', userId)

  if (!conversations?.length) return []

  const convIds = conversations.map(c => c.id)

  const { data } = await supabase
    .from('agent_runs')
    .select('agent_id, input_tokens, output_tokens, cost_usd, duration_ms, feedback')
    .in('conversation_id', convIds)

  if (!data) return []

  const stats: Record<string, {
    runs: number
    inputTokens: number
    outputTokens: number
    costUsd: number
    totalDurationMs: number
    thumbsUp: number
    thumbsDown: number
  }> = {}

  for (const run of data) {
    if (!stats[run.agent_id]) {
      stats[run.agent_id] = { runs: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, totalDurationMs: 0, thumbsUp: 0, thumbsDown: 0 }
    }
    const s = stats[run.agent_id]
    s.runs++
    s.inputTokens += run.input_tokens
    s.outputTokens += run.output_tokens
    s.costUsd += Number(run.cost_usd)
    s.totalDurationMs += run.duration_ms ?? 0
    if (run.feedback === 1) s.thumbsUp++
    if (run.feedback === -1) s.thumbsDown++
  }

  const agentMeta = Object.fromEntries(AGENTS.map(a => [a.id, { name: a.name, emoji: a.emoji }]))

  return Object.entries(stats).map(([agentId, s]) => ({
    agentId,
    name: agentMeta[agentId]?.name ?? agentId,
    emoji: agentMeta[agentId]?.emoji ?? '🤖',
    runs: s.runs,
    inputTokens: s.inputTokens,
    outputTokens: s.outputTokens,
    costUsd: s.costUsd,
    avgDurationMs: s.runs > 0 ? Math.round(s.totalDurationMs / s.runs) : 0,
    winRate: (s.thumbsUp + s.thumbsDown) > 0
      ? Math.round((s.thumbsUp / (s.thumbsUp + s.thumbsDown)) * 100)
      : null,
  })).sort((a, b) => b.runs - a.runs)
}

export async function getConversationTrace(conversationId: string) {
  const { data } = await supabase
    .from('agent_runs')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })

  return data ?? []
}
