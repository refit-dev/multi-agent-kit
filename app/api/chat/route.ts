import { auth } from '@clerk/nextjs/server'
import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '@/lib/supabase'
import { loadMemory, saveMessage } from '@/lib/memory'
import { selectPromptVariant } from '@/lib/bandit'
import { checkRateLimit } from '@/lib/rate-limit'
import { routeToAgent, loadAgentHistory, storeAgentRun } from '@/lib/agents'
import { calculateCost } from '@/lib/cost'

const client = new Anthropic()

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return new Response('Unauthorized', { status: 401 })

  const { message, conversationId } = await req.json()
  if (!message) return new Response('Message required', { status: 400 })

  const { data: user } = await supabase
    .from('users')
    .select('id, plan')
    .eq('clerk_id', userId)
    .single()

  if (!user) return new Response('User not found', { status: 404 })

  const { allowed, remaining } = await checkRateLimit(user.id, user.plan)
  if (!allowed) {
    return new Response(
      JSON.stringify({ error: 'Rate limit exceeded. Upgrade to Pro for more messages.' }),
      { status: 429, headers: { 'Content-Type': 'application/json' } }
    )
  }

  // Get or create conversation
  let convId = conversationId
  if (!convId) {
    const variant = await selectPromptVariant()
    const { data: conv } = await supabase
      .from('conversations')
      .insert({
        user_id: user.id,
        title: message.slice(0, 60),
        system_prompt_variant: variant.id,
      })
      .select('id')
      .single()
    convId = conv?.id
  }

  // Load history + shared agent memory in parallel
  const [history, agentHistory] = await Promise.all([
    loadMemory(convId, user.plan),
    loadAgentHistory(convId),
  ])

  // Route to best agent — captures routing reason for the trace
  const { agent, reason: routingReason } = await routeToAgent(message, history)

  // Build the full system prompt the agent will see
  const systemPrompt = agentHistory
    ? `${agent.systemPrompt}\n\n## Work already done in this conversation:\n${agentHistory}`
    : agent.systemPrompt

  // Build the full context snapshot we're sending (for the trace viewer)
  const contextSnapshot = JSON.stringify({
    systemPromptLength: systemPrompt.length,
    historyMessages: history.length,
    sharedAgentRuns: agentHistory ? agentHistory.split('---').length : 0,
  })

  // Save the user message first
  await saveMessage({ conversationId: convId, role: 'user', content: message })

  const startTime = Date.now()

  // Stream from selected agent — use .stream() to get real token counts at end
  const stream = client.messages.stream({
    model: agent.model,
    max_tokens: agent.maxTokens,
    system: systemPrompt,
    messages: [...history, { role: 'user', content: message }],
  })

  let fullResponse = ''
  const encoder = new TextEncoder()

  const readable = new ReadableStream({
    async start(controller) {
      // Send routing metadata first — UI uses this to show "Researcher Agent thinking..."
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({
          type: 'meta',
          conversationId: convId,
          remaining,
          agent: { id: agent.id, name: agent.name, emoji: agent.emoji },
          routingReason,
        })}\n\n`)
      )

      // Stream text deltas
      for await (const chunk of stream) {
        if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
          fullResponse += chunk.delta.text
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'delta', text: chunk.delta.text })}\n\n`)
          )
        }
      }

      const durationMs = Date.now() - startTime

      // Get REAL token counts from Anthropic — not estimates
      const finalMessage = await stream.finalMessage()
      const inputTokens = finalMessage.usage.input_tokens
      const outputTokens = finalMessage.usage.output_tokens
      const costUsd = calculateCost({ model: agent.model, inputTokens, outputTokens })

      // Save assistant message + agent run in parallel
      const msgId = await saveMessage({ conversationId: convId, role: 'assistant', content: fullResponse })

      await Promise.all([
        storeAgentRun({
          conversationId: convId,
          messageId: msgId,
          agentId: agent.id,
          model: agent.model,
          input: message,
          contextSnapshot,
          output: fullResponse,
          routingReason,
          inputTokens,
          outputTokens,
          durationMs,
        }),
        // Track cost in cost_logs
        supabase.rpc('increment_cost', {
          p_user_id: user.id,
          p_cost_usd: costUsd,
          p_input_tokens: inputTokens,
          p_output_tokens: outputTokens,
        }),
        supabase.rpc('increment_usage', {
          p_user_id: user.id,
          p_tokens: inputTokens + outputTokens,
        }),
      ])

      // Send final event with cost + token data for live cost meter
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({
          type: 'done',
          messageId: msgId,
          inputTokens,
          outputTokens,
          costUsd,
          durationMs,
        })}\n\n`)
      )
      controller.close()
    },
  })

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
