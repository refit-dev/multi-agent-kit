import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { formatCost } from '@/lib/cost'
import { AGENTS } from '@/lib/agents'

const agentMeta = Object.fromEntries(AGENTS.map(a => [a.id, { name: a.name, emoji: a.emoji }]))

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { conversationId } = await params

  // Verify conversation belongs to this user
  const { data: user } = await supabase
    .from('users')
    .select('id')
    .eq('clerk_id', userId)
    .single()

  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const { data: conversation } = await supabase
    .from('conversations')
    .select('id, title, created_at')
    .eq('id', conversationId)
    .eq('user_id', user.id)
    .single()

  if (!conversation) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Fetch all agent runs for this conversation
  const { data: runs } = await supabase
    .from('agent_runs')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })

  if (!runs) return NextResponse.json({ traces: [], totalCost: '$0' })

  const totalCostUsd = runs.reduce((sum, r) => sum + Number(r.cost_usd), 0)
  const totalInputTokens = runs.reduce((sum, r) => sum + r.input_tokens, 0)
  const totalOutputTokens = runs.reduce((sum, r) => sum + r.output_tokens, 0)

  const traces = runs.map(run => ({
    id: run.id,
    messageId: run.message_id,
    agentId: run.agent_id,
    agentName: agentMeta[run.agent_id]?.name ?? run.agent_id,
    agentEmoji: agentMeta[run.agent_id]?.emoji ?? '🤖',
    model: run.model,
    input: run.input,
    output: run.output,
    contextSnapshot: run.context_snapshot ? JSON.parse(run.context_snapshot) : null,
    routingReason: run.routing_reason,
    inputTokens: run.input_tokens,
    outputTokens: run.output_tokens,
    totalTokens: run.input_tokens + run.output_tokens,
    costUsd: Number(run.cost_usd),
    costFormatted: formatCost(Number(run.cost_usd)),
    contextUtilization: run.context_utilization,
    durationMs: run.duration_ms,
    feedback: run.feedback,
    createdAt: run.created_at,
  }))

  return NextResponse.json({
    conversationId,
    title: conversation.title,
    traces,
    summary: {
      totalRuns: runs.length,
      totalInputTokens,
      totalOutputTokens,
      totalTokens: totalInputTokens + totalOutputTokens,
      totalCostUsd,
      totalCostFormatted: formatCost(totalCostUsd),
      agentsUsed: [...new Set(runs.map(r => r.agent_id))],
    },
  })
}
