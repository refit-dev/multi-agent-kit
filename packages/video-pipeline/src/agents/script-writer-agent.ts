/**
 * ScriptWriterAgent
 *
 * Receives structured SearchResults from WebSearchAgent and writes
 * a properly formatted video script with sections, timing, and visual notes.
 *
 * Key context management: we pass keyFacts[] and synthesis (structured)
 * NOT raw search results. This keeps Claude's context clean and focused.
 *
 * Output: VideoScript with sections[] so AudioGenAgent gets the
 * exact narration text, nothing else.
 */

import Anthropic from '@anthropic-ai/sdk'
import type { PipelineContext, VideoScript, ScriptSection } from '../types.js'
import { PipelineError } from '../types.js'
import { calculateCost } from '../cost.js'

export async function scriptWriterAgent(ctx: PipelineContext): Promise<VideoScript> {
  if (!ctx.searchResults) {
    throw new PipelineError('ScriptWriterAgent requires searchResults in context', 'script-writer')
  }

  const { query, config, searchResults } = ctx
  const targetDuration = config.scriptTargetDuration ?? 60
  const startMs = Date.now()

  ctx.config.onProgress?.({ stage: 'writing-script', message: `Writing ${targetDuration}s video script` })

  const client = new Anthropic({ apiKey: config.anthropicApiKey })

  // Build a clean, focused context from structured search results
  // NOT dumping raw search content — that wastes tokens and confuses the model
  const researchContext = [
    `Topic: ${query}`,
    `Research Summary: ${searchResults.synthesis}`,
    `Key Facts:\n${searchResults.keyFacts.map((f, i) => `${i + 1}. ${f}`).join('\n')}`,
    `Sources: ${searchResults.sources.slice(0, 3).join(', ')}`,
  ].join('\n\n')

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: `You are an expert video script writer. Write engaging, clear scripts for YouTube/social media videos.
- Use conversational language (contractions, short sentences)
- Each word ≈ 0.5 seconds when spoken, so ${targetDuration}s = ~${targetDuration * 2} words
- Structure: hook intro, 2-3 main points, strong outro with CTA
- Visual notes tell the video editor what to show, NOT what to narrate
- Respond with valid JSON only`,
    messages: [{
      role: 'user',
      content: `Write a ${targetDuration}-second video script about: "${query}"

Research to use:
${researchContext}

Return JSON in this exact format:
{
  "title": "video title",
  "targetAudience": "who this video is for",
  "tone": "educational|casual|professional|energetic",
  "sections": [
    {
      "id": "s1",
      "type": "intro",
      "title": "section title",
      "content": "exact narration text — what the narrator says",
      "durationSeconds": 10,
      "visualNotes": "what to show on screen during this section"
    }
  ]
}

Section types: intro (hook, 5-10s), main (key points, can repeat), transition (brief, 2-5s), outro (CTA, 5-10s).
Make sure total section durations sum to ~${targetDuration} seconds.`,
    }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''

  let parsed: any
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    parsed = JSON.parse(jsonMatch?.[0] ?? '{}')
  } catch {
    throw new PipelineError('ScriptWriterAgent returned invalid JSON', 'script-writer')
  }

  if (!parsed.sections?.length) {
    throw new PipelineError('ScriptWriterAgent returned no sections', 'script-writer')
  }

  const sections: ScriptSection[] = parsed.sections.map((s: any, i: number) => ({
    id: s.id ?? `s${i + 1}`,
    type: s.type ?? 'main',
    title: s.title ?? `Section ${i + 1}`,
    content: s.content ?? '',
    durationSeconds: s.durationSeconds ?? Math.floor(targetDuration / parsed.sections.length),
    visualNotes: s.visualNotes,
  }))

  const fullText = sections.map(s => s.content).join(' ')
  const wordCount = fullText.split(/\s+/).filter(Boolean).length
  const totalDuration = sections.reduce((sum, s) => sum + s.durationSeconds, 0)

  const inputTokens = response.usage.input_tokens
  const outputTokens = response.usage.output_tokens

  return {
    title: parsed.title ?? query,
    totalDurationSeconds: totalDuration,
    targetAudience: parsed.targetAudience ?? 'General audience',
    tone: parsed.tone ?? 'educational',
    sections,
    fullText,
    wordCount,
    tokenUsage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens },
    durationMs: Date.now() - startMs,
  }
}
