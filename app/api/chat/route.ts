import { auth } from '@clerk/nextjs/server'
import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '@/lib/supabase'
import { loadMemory, saveMessage, estimateTokens } from '@/lib/memory'
import { selectPromptVariant } from '@/lib/bandit'
import { checkRateLimit, trackTokenUsage } from '@/lib/rate-limit'

const client = new Anthropic()

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return new Response('Unauthorized', { status: 401 })

  const { message, conversationId } = await req.json()
  if (!message) return new Response('Message required', { status: 400 })

  // Get user + plan from DB
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
  let systemPrompt: string

  if (!convId) {
    const variant = await selectPromptVariant()
    systemPromptVariantId = variant.id
    systemPrompt = variant.content

    const { data: conv } = await supabase
      .from('conversations')
      .insert({
        user_id: user.id,
        title: message.slice(0, 50),
        system_prompt_variant: systemPromptVariantId,
      })
      .select('id')
      .single()

    convId = conv?.id
  } else {
    const { data: conv } = await supabase
      .from('conversations')
      .select('system_prompt_variant, prompt_variants(content)')
      .eq('id', convId)
      .single()

    systemPromptVariantId = conv?.system_prompt_variant ?? ''
    systemPrompt = (conv?.prompt_variants as any)?.content ?? 'You are a helpful AI assistant.'
  }

  // Load memory (respects plan limits)
  const history = await loadMemory(convId, user.plan)

  // Save user message
  await saveMessage({ conversationId: convId, role: 'user', content: message })

  // Stream response from Claude
  const stream = await client.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: systemPrompt,
    messages: [...history, { role: 'user', content: message }],
  })

  let fullResponse = ''
  const encoder = new TextEncoder()

  const readable = new ReadableStream({
    async start(controller) {
      // Stream metadata first (conversationId for new convos)
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: 'meta', conversationId: convId, remaining })}\n\n`)
      )

      for await (const chunk of stream) {
        if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
          fullResponse += chunk.delta.text
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'delta', text: chunk.delta.text })}\n\n`)
          )
        }
      }

      // Save assistant message + track usage
      const msgId = await saveMessage({ conversationId: convId, role: 'assistant', content: fullResponse })
      const tokens = estimateTokens(message + fullResponse)
      await trackTokenUsage(user.id, tokens)

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
