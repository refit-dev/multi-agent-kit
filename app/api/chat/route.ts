import { auth } from '@clerk/nextjs/server'
import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '@/lib/supabase'
import { loadMemory, saveMessage, estimateTokens } from '@/lib/memory'
import { selectPromptVariant } from '@/lib/bandit'
import { checkRateLimit, trackTokenUsage } from '@/lib/rate-limit'
import { routeToAgent, loadAgentHistory, storeAgentOutput } from '@/lib/agents'

const client = new Anthropic()

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return new Response('Unauthorized', { status: 401 })

  const { message, conversationId } = await req.json()
  if (!message) return new Response('Message required', { status: 400 })

  // Get user + plan
  const { data: user } = await supabase
    .from('users')
    .select('id, plan')
    .eq('clerk_id', userId)
    .single()

  if (!user) return new Response('User not found', { status: 404 })

  // Rate limit check
  const { allowed, remaining } = await checkRateLimit(user.id, user.plan)
  if (!allowed) {
    return new Response(
      JSON.stringify({ error: 'Rate limit exceeded. Upgrade to Pro for more messages.' }),
      { status: 429, headers: { 'Content-Type': 'application/json' } }
    )
  }

  // Get or create conversation
  let convId = conversationId
  let systemPromptVariantId: string

  if (!convId) {
    const variant = await selectPromptVariant()
    systemPromptVariantId = variant.id

    const { data: conv } = await supabase
      .from('conversations')
      .insert({
        user_id: user.id,
        title: message.slice(0, 60),
        system_prompt_variant: systemPromptVariantId,
      })
      .select('id')
      .single()

    convId = conv?.id
  }

  // Load conversation memory + what other agents have done (shared context)
  const [history, agentHistory] = await Promise.all([
    loadMemory(convId, user.plan),
    loadAgentHistory(convId),
  ])

  // Route to best specialist agent
  const agent = await routeToAgent(message, history)

  // Build system prompt: agent's base prompt + shared agent memory
  const systemPrompt = agentHistory
    ? `${agent.systemPrompt}\n\n## Context from other agents in this conversation:\n${agentHistory}`
    : agent.systemPrompt

  // Save user message
  await saveMessage({ conversationId: convId, role: 'user', content: message })

  // Stream response from the selected agent
  const stream = await client.messages.stream({
    model: agent.model,
    max_tokens: agent.maxTokens,
    system: systemPrompt,
    messages: [...history, { role: 'user', content: message }],
  })

  let fullResponse = ''
  const encoder = new TextEncoder()

  const readable = new ReadableStream({
    async start(controller) {
      // Send routing info first so the UI can show which agent is responding
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({
          type: 'meta',
          conversationId: convId,
          remaining,
          agent: { id: agent.id, name: agent.name },
        })}\n\n`)
      )

      for await (const chunk of stream) {
        if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
          fullResponse += chunk.delta.text
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'delta', text: chunk.delta.text })}\n\n`)
          )
        }
      }

      // Save to messages + agent_runs (shared memory for other agents)
      const [msgId] = await Promise.all([
        saveMessage({ conversationId: convId, role: 'assistant', content: fullResponse }),
        storeAgentOutput({
          conversationId: convId,
          agentId: agent.id,
          input: message,
          output: fullResponse,
          tokenCount: estimateTokens(message + fullResponse),
        }),
        trackTokenUsage(user.id, estimateTokens(message + fullResponse)),
      ])

      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: 'done', messageId: msgId })}\n\n`)
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
