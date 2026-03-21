/**
 * VideoPipeline — Main Orchestrator
 *
 * Runs agents sequentially, passing context between them.
 * Each agent enriches the shared PipelineContext object.
 * Full traces are recorded for debugging and observability.
 */

import { webSearchAgent } from './agents/web-search-agent.js'
import { scriptWriterAgent } from './agents/script-writer-agent.js'
import { audioGenAgent } from './agents/audio-gen-agent.js'
import { videoGenAgent } from './agents/video-gen-agent.js'
import { calculateCost, formatCost } from './cost.js'
import type {
  PipelineConfig,
  PipelineContext,
  PipelineResult,
  AgentTrace,
} from './types.js'
import { PipelineError } from './types.js'

export class VideoPipeline {
  private config: PipelineConfig

  constructor(config: PipelineConfig) {
    this.validateConfig(config)
    this.config = config
  }

  async run(query: string): Promise<PipelineResult> {
    if (!query?.trim()) throw new PipelineError('Query cannot be empty', 'pipeline')

    const startMs = Date.now()

    // Shared context — grows as each agent runs
    const ctx: PipelineContext = {
      query: query.trim(),
      config: this.config,
      startedAt: new Date(),
      traces: [],
    }

    // ── Agent 1: Web Search ──────────────────────────────────────────────────
    ctx.searchResults = await this.runAgent(
      ctx,
      'web-search',
      'Web Search Agent',
      () => webSearchAgent(ctx),
      (r) => `Searched "${query}", found ${r.results.length} sources, extracted ${r.keyFacts.length} key facts`,
      (r) => `${r.synthesis.slice(0, 120)}…`,
      (r) => r.tokenUsage,
      (r) => calculateCost('claude-sonnet-4-6', r.tokenUsage.inputTokens, r.tokenUsage.outputTokens)
    )

    // ── Agent 2: Script Writer ───────────────────────────────────────────────
    ctx.script = await this.runAgent(
      ctx,
      'script-writer',
      'Script Writer Agent',
      () => scriptWriterAgent(ctx),
      (r) => `Received ${ctx.searchResults!.keyFacts.length} facts, wrote ${r.wordCount}-word script in ${r.sections.length} sections`,
      (r) => `"${r.title}" — ${r.totalDurationSeconds}s, ${r.tone} tone`,
      (r) => r.tokenUsage,
      (r) => calculateCost('claude-sonnet-4-6', r.tokenUsage.inputTokens, r.tokenUsage.outputTokens)
    )

    // ── Agent 3: Audio Generation ────────────────────────────────────────────
    ctx.audio = await this.runAgent(
      ctx,
      'audio-gen',
      'Audio Gen Agent',
      () => audioGenAgent(ctx),
      (r) => `Received ${ctx.script!.wordCount}-word script, generating audio with ElevenLabs voice: ${r.voice}`,
      (r) => `Saved to ${r.filePath} (${(r.fileSizeBytes / 1024).toFixed(1)} KB, ~${r.durationSeconds.toFixed(0)}s)`,
      undefined,
      undefined
    )

    // ── Agent 4: Video Generation (optional) ────────────────────────────────
    if (this.config.generateVideo) {
      ctx.video = await this.runAgent(
        ctx,
        'video-gen',
        'Video Gen Agent',
        () => videoGenAgent(ctx),
        (r) => `${ctx.script!.sections.length} script sections + audio at ${ctx.audio!.filePath}`,
        (r) => `Video saved to ${r.filePath} (${r.sections} scenes, ~${r.durationSeconds}s)`,
        undefined,
        undefined
      )
    }

    this.config.onProgress?.({ stage: 'done', message: 'Pipeline complete!' })

    // ── Aggregate results ────────────────────────────────────────────────────
    const totalCostUsd = ctx.traces.reduce((sum, t) => sum + (t.costUsd ?? 0), 0)
    const totalTokens = ctx.traces.reduce((sum, t) => sum + (t.tokenUsage?.totalTokens ?? 0), 0)

    return {
      query,
      searchResults: ctx.searchResults!,
      script: ctx.script!,
      audio: ctx.audio!,
      video: ctx.video,
      traces: ctx.traces,
      totalCostUsd,
      totalCostFormatted: formatCost(totalCostUsd),
      totalDurationMs: Date.now() - startMs,
      totalTokens,
    }
  }

  // ── Generic agent runner with tracing ──────────────────────────────────────
  private async runAgent<T>(
    ctx: PipelineContext,
    agentId: AgentTrace['agentId'],
    agentName: string,
    fn: () => Promise<T>,
    inputSummaryFn: (result: T) => string,
    outputSummaryFn: (result: T) => string,
    tokenUsageFn?: (result: T) => AgentTrace['tokenUsage'],
    costFn?: (result: T) => number
  ): Promise<T> {
    const startedAt = new Date()
    const startMs = Date.now()

    let result: T
    try {
      result = await fn()
    } catch (err) {
      const durationMs = Date.now() - startMs
      const trace: AgentTrace = {
        agentId,
        agentName,
        status: 'error',
        inputSummary: `Failed at ${agentName}`,
        outputSummary: '',
        durationMs,
        error: err instanceof Error ? err.message : String(err),
        startedAt,
        completedAt: new Date(),
      }
      ctx.traces.push(trace)
      // Re-throw as PipelineError
      if (err instanceof PipelineError) throw err
      throw new PipelineError(`${agentName} failed: ${String(err)}`, agentId, err)
    }

    const durationMs = Date.now() - startMs
    const tokenUsage = tokenUsageFn?.(result)
    const costUsd = costFn?.(result)

    const trace: AgentTrace = {
      agentId,
      agentName,
      status: 'success',
      inputSummary: inputSummaryFn(result),
      outputSummary: outputSummaryFn(result),
      tokenUsage,
      costUsd,
      costFormatted: costUsd !== undefined ? formatCost(costUsd) : undefined,
      durationMs,
      startedAt,
      completedAt: new Date(),
    }
    ctx.traces.push(trace)

    return result
  }

  private validateConfig(config: PipelineConfig): void {
    const required: (keyof PipelineConfig)[] = ['anthropicApiKey', 'tavilyApiKey', 'elevenLabsApiKey']
    for (const key of required) {
      if (!config[key]) {
        throw new PipelineError(`Missing required config: ${key}`, 'pipeline')
      }
    }
  }
}
