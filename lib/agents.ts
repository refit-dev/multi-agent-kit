/**
 * multi-agent-kit — Agent Definitions & Orchestrator
 *
 * How it works:
 * 1. User sends a message
 * 2. RouterAgent reads it and picks the best specialist agent
 * 3. The specialist agent runs with its own focused system prompt
 * 4. Results are stored in shared memory (Postgres) so other agents can read them
 * 5. RLHF bandit tracks which agent selection gets thumbs up → improves routing over time
 */

import Anthropic from '@anthropic-ai/sdk'
import { supabase } from './supabase'

const client = new Anthropic()

// ── Agent Registry ────────────────────────────────────────────────────────────

export interface AgentDefinition {
  id: string
  name: string
  description: string   // used by the router to decide who to call
  systemPrompt: string
  model: string
  maxTokens: number
}

export const AGENTS: AgentDefinition[] = [
  {
    id: 'researcher',
    name: 'Researcher',
    description: 'Finds information, summarizes knowledge, answers factual questions',
    systemPrompt: `You are a research specialist. Your job is to find and synthesize information clearly and accurately.
Be thorough but concise. Cite your reasoning. Structure complex answers with headers.`,
    model: 'claude-sonnet-4-6',
    maxTokens: 1024,
  },
  {
    id: 'coder',
    name: 'Coder',
    description: 'Writes, reviews, debugs, and explains code in any language',
    systemPrompt: `You are an expert software engineer. Write clean, production-ready code with clear explanations.
Always explain what the code does and why. Point out edge cases and potential bugs.`,
    model: 'claude-sonnet-4-6',
    maxTokens: 2048,
  },
  {
    id: 'analyst',
    name: 'Analyst',
    description: 'Analyzes data, finds patterns, makes decisions, evaluates trade-offs',
    systemPrompt: `You are a critical thinking analyst. Break down complex problems systematically.
List pros/cons, quantify where possible, and give a clear recommendation with reasoning.`,
    model: 'claude-sonnet-4-6',
    maxTokens: 1024,
  },
  {
    id: 'writer',
    name: 'Writer',
    description: 'Writes and edits content — emails, docs, posts, copy, summaries',
    systemPrompt: `You are a professional writer and editor. Write clearly, concisely, and with appropriate tone.
Match the user's voice when editing. Make content compelling and easy to read.`,
    model: 'claude-sonnet-4-6',
    maxTokens: 2048,
  },
  {
    id: 'planner',
    name: 'Planner',
    description: 'Breaks down complex tasks, creates step-by-step plans and roadmaps',
    systemPrompt: `You are a strategic planner. Break ambiguous goals into clear, actionable steps.
Create concrete plans with priorities, dependencies, and success criteria.`,
    model: 'claude-haiku-4-5-20251001',
    maxTokens: 1024,
  },
]

// ── Router Agent ──────────────────────────────────────────────────────────────

export async function routeToAgent(
  message: string,
  conversationHistory: { role: 'user' | 'assistant'; content: string }[]
): Promise<AgentDefinition> {
  const agentList = AGENTS.map(a => `- ${a.id}: ${a.description}`).join('\n')

  const routerResponse = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',  // fast + cheap for routing
    max_tokens: 50,
    system: `You are a routing agent. Given a user message, pick the BEST specialist agent to handle it.
Respond with ONLY the agent ID. Available agents:
${agentList}`,
    messages: [
      ...conversationHistory.slice(-4),  // last 4 messages for context
      { role: 'user', content: `Route this message: "${message}"` },
    ],
  })

  const routedId = routerResponse.content[0].type === 'text'
    ? routerResponse.content[0].text.trim().toLowerCase()
    : 'researcher'

  return AGENTS.find(a => a.id === routedId) ?? AGENTS[0]
}

// ── Shared Agent Memory ───────────────────────────────────────────────────────

// Store agent output so other agents in the same conversation can read it
export async function storeAgentOutput(params: {
  conversationId: string
  agentId: string
  input: string
  output: string
  tokenCount: number
}): Promise<string> {
  const { data } = await supabase
    .from('agent_runs')
    .insert({
      conversation_id: params.conversationId,
      agent_id: params.agentId,
      input: params.input,
      output: params.output,
      token_count: params.tokenCount,
    })
    .select('id')
    .single()

  return data?.id ?? ''
}

// Load what previous agents have done in this conversation (shared context)
export async function loadAgentHistory(conversationId: string): Promise<string> {
  const { data: runs } = await supabase
    .from('agent_runs')
    .select('agent_id, input, output, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(10)

  if (!runs || runs.length === 0) return ''

  return runs
    .map(r => `[${r.agent_id.toUpperCase()} AGENT]\nTask: ${r.input}\nResult: ${r.output}`)
    .join('\n\n---\n\n')
}

// Get agent run stats for observability dashboard
export async function getAgentStats(userId: string) {
  const { data } = await supabase
    .from('agent_runs')
    .select('agent_id, token_count, conversations!inner(user_id)')
    .eq('conversations.user_id', userId)

  if (!data) return []

  const stats: Record<string, { runs: number; tokens: number }> = {}
  for (const run of data) {
    if (!stats[run.agent_id]) stats[run.agent_id] = { runs: 0, tokens: 0 }
    stats[run.agent_id].runs++
    stats[run.agent_id].tokens += run.token_count
  }

  return Object.entries(stats).map(([agentId, s]) => ({
    agentId,
    name: AGENTS.find(a => a.id === agentId)?.name ?? agentId,
    ...s,
  }))
}
