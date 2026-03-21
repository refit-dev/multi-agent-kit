/**
 * WebSearchAgent
 *
 * Two-step approach for maximum quality:
 * 1. Tavily search — finds the most relevant, recent web pages for the query
 * 2. Claude synthesis — reads all results and extracts structured facts
 *
 * Why two steps instead of just search?
 * Raw search results are noisy (ads, navigation text, repeated content).
 * Claude synthesises them into clean facts the script writer can actually use.
 *
 * Context handoff: returns SearchResults with structured keyFacts[]
 * so the ScriptWriterAgent doesn't have to re-parse raw HTML.
 */

import Anthropic from '@anthropic-ai/sdk'
import type { PipelineContext, SearchResult, SearchResults, PipelineError as PE } from '../types.js'
import { PipelineError } from '../types.js'
import { calculateCost, formatCost } from '../cost.js'

const TAVILY_API = 'https://api.tavily.com/search'

interface TavilyResult {
  title: string
  url: string
  content: string
  score: number
  published_date?: string
}

interface TavilyResponse {
  results: TavilyResult[]
  answer?: string  // Tavily's own AI answer (we supplement with Claude)
}

export async function webSearchAgent(ctx: PipelineContext): Promise<SearchResults> {
  const { query, config } = ctx
  const maxResults = config.searchMaxResults ?? 5
  const startedAt = new Date()
  const startMs = Date.now()

  ctx.config.onProgress?.({ stage: 'searching', message: `Searching web for: "${query}"` })

  // ── Step 1: Tavily Search ──────────────────────────────────────────────────

  let tavilyResults: TavilyResult[] = []

  try {
    const response = await fetch(TAVILY_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.tavilyApiKey}`,
      },
      body: JSON.stringify({
        query,
        max_results: maxResults,
        search_depth: 'advanced',   // deep crawl for better content
        include_answer: false,       // we'll synthesize with Claude instead
        include_raw_content: false,
      }),
    })

    if (!response.ok) {
      throw new PipelineError(
        `Tavily search failed: ${response.status} ${response.statusText}`,
        'web-search'
      )
    }

    const data = await response.json() as TavilyResponse
    tavilyResults = data.results ?? []
  } catch (err) {
    if (err instanceof PipelineError) throw err
    throw new PipelineError(`Tavily request failed: ${String(err)}`, 'web-search', err)
  }

  if (tavilyResults.length === 0) {
    throw new PipelineError(`No search results found for: "${query}"`, 'web-search')
  }

  ctx.config.onProgress?.({ stage: 'synthesizing', message: `Synthesizing ${tavilyResults.length} sources with Claude` })

  // ── Step 2: Claude Synthesis ───────────────────────────────────────────────
  // Claude reads all results and extracts structured, video-ready facts

  const client = new Anthropic({ apiKey: config.anthropicApiKey })
  const targetDuration = config.scriptTargetDuration ?? 60

  const searchContext = tavilyResults
    .map((r, i) => `[Source ${i + 1}] ${r.title}\nURL: ${r.url}\n${r.content}`)
    .join('\n\n---\n\n')

  const synthesisResponse = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: `You are a research analyst preparing facts for a ${targetDuration}-second video script.
Extract only the most important, verifiable, interesting facts from the sources.
Be accurate. Prioritize facts that are engaging for a general audience.
Respond with valid JSON only.`,
    messages: [{
      role: 'user',
      content: `Query: "${query}"

Sources:
${searchContext}

Extract and return JSON in this exact format:
{
  "synthesis": "2-3 sentence overview of what the research found",
  "keyFacts": ["fact 1", "fact 2", "fact 3", "fact 4", "fact 5"],
  "primaryAngle": "the most interesting/surprising angle for a video about this topic"
}`,
    }],
  })

  let synthesis = ''
  let keyFacts: string[] = []

  try {
    const text = synthesisResponse.content[0].type === 'text'
      ? synthesisResponse.content[0].text
      : '{}'
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    const parsed = JSON.parse(jsonMatch?.[0] ?? '{}')
    synthesis = parsed.synthesis ?? ''
    keyFacts = parsed.keyFacts ?? []
    if (parsed.primaryAngle) {
      synthesis = `${synthesis} ${parsed.primaryAngle}`
    }
  } catch {
    // Fallback: use raw text as synthesis
    synthesis = synthesisResponse.content[0].type === 'text'
      ? synthesisResponse.content[0].text.slice(0, 500)
      : ''
    keyFacts = tavilyResults.map(r => r.title)
  }

  const inputTokens = synthesisResponse.usage.input_tokens
  const outputTokens = synthesisResponse.usage.output_tokens
  const costUsd = calculateCost('claude-sonnet-4-6', inputTokens, outputTokens)

  const results: SearchResult[] = tavilyResults.map(r => ({
    title: r.title,
    url: r.url,
    content: r.content,
    score: r.score,
    publishedDate: r.published_date,
  }))

  return {
    query,
    results,
    synthesis,
    keyFacts,
    sources: results.map(r => r.url),
    tokenUsage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens },
    durationMs: Date.now() - startMs,
  }
}
