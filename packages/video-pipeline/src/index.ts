/**
 * multi-agent-video-pipeline
 *
 * Turn any text prompt into a video script + audio narration using
 * three coordinated AI agents with proper context management.
 *
 * Usage:
 *   import { VideoPipeline } from 'multi-agent-video-pipeline'
 *
 *   const pipeline = new VideoPipeline({
 *     anthropicApiKey: process.env.ANTHROPIC_API_KEY!,
 *     tavilyApiKey: process.env.TAVILY_API_KEY!,
 *     elevenLabsApiKey: process.env.ELEVENLABS_API_KEY!,
 *     scriptTargetDuration: 90,  // seconds
 *     onProgress: (e) => console.log(e.message),
 *   })
 *
 *   const result = await pipeline.run('Explain quantum entanglement simply')
 *   console.log(result.script.fullText)
 *   console.log(`Audio saved to: ${result.audio.filePath}`)
 *   console.log(`Total cost: ${result.totalCostFormatted}`)
 */

export { VideoPipeline } from './pipeline.js'

export type {
  PipelineConfig,
  PipelineContext,
  PipelineResult,
  PipelineError,
  SearchResult,
  SearchResults,
  VideoScript,
  ScriptSection,
  AudioOutput,
  VideoOutput,
  AgentTrace,
  TokenUsage,
  ProgressEvent,
  TTSVoice,
} from './types.js'

export { PipelineError as VideoPipelineError } from './types.js'
export { calculateCost, formatCost } from './cost.js'
