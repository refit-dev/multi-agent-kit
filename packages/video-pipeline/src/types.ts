// ─────────────────────────────────────────────────────────────────────────────
// multi-agent-video-pipeline — Shared Types
//
// Each agent receives the full PipelineContext and adds its output to it.
// This is how agents share structured data without losing information.
// ─────────────────────────────────────────────────────────────────────────────

// ── Config ────────────────────────────────────────────────────────────────────

export interface PipelineConfig {
  anthropicApiKey: string
  tavilyApiKey: string
  elevenLabsApiKey: string
  openaiApiKey?: string           // required only if generateVideo: true

  // Optional overrides
  searchMaxResults?: number       // default: 5
  scriptTargetDuration?: number   // seconds, default: 60
  elevenLabsVoiceId?: string      // override auto voice selection
  elevenLabsModel?: string        // default: 'eleven_turbo_v2_5'
  generateVideo?: boolean         // run VideoGenAgent (needs openaiApiKey + ffmpeg), default: false
  outputDir?: string              // where to save files, default: './output'
  onProgress?: (event: ProgressEvent) => void  // progress callback
}

export type TTSVoice = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer'

// ── Pipeline Context (grows as agents run) ────────────────────────────────────

export interface PipelineContext {
  // Set by user / pipeline
  query: string
  config: PipelineConfig
  startedAt: Date

  // Set by WebSearchAgent
  searchResults?: SearchResults

  // Set by ScriptWriterAgent
  script?: VideoScript

  // Set by AudioGenAgent
  audio?: AudioOutput

  // Set by VideoGenAgent (optional)
  video?: VideoOutput

  // Accumulated traces from all agents
  traces: AgentTrace[]
}

// ── Web Search Agent types ────────────────────────────────────────────────────

export interface SearchResult {
  title: string
  url: string
  content: string        // relevant snippet
  score: number          // relevance score 0-1
  publishedDate?: string
}

export interface SearchResults {
  query: string
  results: SearchResult[]
  synthesis: string      // Claude's synthesis of the results into coherent facts
  keyFacts: string[]     // bullet points of the most important facts
  sources: string[]      // URLs for attribution
  tokenUsage: TokenUsage
  durationMs: number
}

// ── Script Writer Agent types ─────────────────────────────────────────────────

export interface ScriptSection {
  id: string
  type: 'intro' | 'main' | 'transition' | 'outro'
  title: string
  content: string        // the actual narration text
  durationSeconds: number
  visualNotes?: string   // notes for what to show on screen
}

export interface VideoScript {
  title: string
  totalDurationSeconds: number
  targetAudience: string
  tone: 'educational' | 'casual' | 'professional' | 'energetic'
  sections: ScriptSection[]
  fullText: string       // joined narration (fed to TTS)
  wordCount: number
  tokenUsage: TokenUsage
  durationMs: number
}

// ── Audio Gen Agent types ─────────────────────────────────────────────────────

export interface AudioOutput {
  filePath: string       // saved .mp3 path
  buffer: Buffer         // raw audio bytes
  durationSeconds: number
  fileSizeBytes: number
  voice: TTSVoice
  model: string
  durationMs: number
}

// ── Video Gen Agent types ─────────────────────────────────────────────────────

export interface VideoOutput {
  filePath: string         // saved .mp4 path
  durationSeconds: number
  sections: number         // number of scenes
  imagesGenerated: number
  durationMs: number
}

// ── Tracing types ─────────────────────────────────────────────────────────────

export interface AgentTrace {
  agentId: 'web-search' | 'script-writer' | 'audio-gen' | 'video-gen'
  agentName: string
  status: 'success' | 'error'
  inputSummary: string   // what the agent received
  outputSummary: string  // what the agent produced
  tokenUsage?: TokenUsage
  costUsd?: number
  costFormatted?: string
  durationMs: number
  error?: string
  startedAt: Date
  completedAt: Date
}

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

// ── Pipeline Result ────────────────────────────────────────────────────────────

export interface PipelineResult {
  query: string
  searchResults: SearchResults
  script: VideoScript
  audio: AudioOutput
  video?: VideoOutput          // present when generateVideo: true
  traces: AgentTrace[]
  totalCostUsd: number
  totalCostFormatted: string
  totalDurationMs: number
  totalTokens: number
}

// ── Progress Events ───────────────────────────────────────────────────────────

export type ProgressEvent =
  | { stage: 'searching';          message: string }
  | { stage: 'synthesizing';       message: string }
  | { stage: 'writing-script';     message: string }
  | { stage: 'generating-audio';   message: string }
  | { stage: 'generating-images';  message: string }
  | { stage: 'assembling-video';   message: string }
  | { stage: 'done';               message: string }

// ── Errors ────────────────────────────────────────────────────────────────────

export class PipelineError extends Error {
  constructor(
    message: string,
    public readonly agent: string,
    public readonly cause?: unknown
  ) {
    super(message)
    this.name = 'PipelineError'
  }
}
