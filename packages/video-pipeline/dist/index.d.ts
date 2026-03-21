interface PipelineConfig {
    anthropicApiKey: string;
    tavilyApiKey: string;
    elevenLabsApiKey: string;
    searchMaxResults?: number;
    scriptTargetDuration?: number;
    elevenLabsVoiceId?: string;
    elevenLabsModel?: string;
    outputDir?: string;
    onProgress?: (event: ProgressEvent) => void;
}
type TTSVoice = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
interface PipelineContext {
    query: string;
    config: PipelineConfig;
    startedAt: Date;
    searchResults?: SearchResults;
    script?: VideoScript;
    audio?: AudioOutput;
    traces: AgentTrace[];
}
interface SearchResult {
    title: string;
    url: string;
    content: string;
    score: number;
    publishedDate?: string;
}
interface SearchResults {
    query: string;
    results: SearchResult[];
    synthesis: string;
    keyFacts: string[];
    sources: string[];
    tokenUsage: TokenUsage;
    durationMs: number;
}
interface ScriptSection {
    id: string;
    type: 'intro' | 'main' | 'transition' | 'outro';
    title: string;
    content: string;
    durationSeconds: number;
    visualNotes?: string;
}
interface VideoScript {
    title: string;
    totalDurationSeconds: number;
    targetAudience: string;
    tone: 'educational' | 'casual' | 'professional' | 'energetic';
    sections: ScriptSection[];
    fullText: string;
    wordCount: number;
    tokenUsage: TokenUsage;
    durationMs: number;
}
interface AudioOutput {
    filePath: string;
    buffer: Buffer;
    durationSeconds: number;
    fileSizeBytes: number;
    voice: TTSVoice;
    model: string;
    durationMs: number;
}
interface AgentTrace {
    agentId: 'web-search' | 'script-writer' | 'audio-gen';
    agentName: string;
    status: 'success' | 'error';
    inputSummary: string;
    outputSummary: string;
    tokenUsage?: TokenUsage;
    costUsd?: number;
    costFormatted?: string;
    durationMs: number;
    error?: string;
    startedAt: Date;
    completedAt: Date;
}
interface TokenUsage {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
}
interface PipelineResult {
    query: string;
    searchResults: SearchResults;
    script: VideoScript;
    audio: AudioOutput;
    traces: AgentTrace[];
    totalCostUsd: number;
    totalCostFormatted: string;
    totalDurationMs: number;
    totalTokens: number;
}
type ProgressEvent = {
    stage: 'searching';
    message: string;
} | {
    stage: 'synthesizing';
    message: string;
} | {
    stage: 'writing-script';
    message: string;
} | {
    stage: 'generating-audio';
    message: string;
} | {
    stage: 'done';
    message: string;
};
declare class PipelineError extends Error {
    readonly agent: string;
    readonly cause?: unknown | undefined;
    constructor(message: string, agent: string, cause?: unknown | undefined);
}

/**
 * VideoPipeline — Main Orchestrator
 *
 * Runs agents sequentially, passing context between them.
 * Each agent enriches the shared PipelineContext object.
 * Full traces are recorded for debugging and observability.
 */

declare class VideoPipeline {
    private config;
    constructor(config: PipelineConfig);
    run(query: string): Promise<PipelineResult>;
    private runAgent;
    private validateConfig;
}

declare function calculateCost(model: string, inputTokens: number, outputTokens: number): number;
declare function formatCost(usd: number): string;

export { type AgentTrace, type AudioOutput, type PipelineConfig, type PipelineContext, PipelineError, type PipelineResult, type ProgressEvent, type ScriptSection, type SearchResult, type SearchResults, type TTSVoice, type TokenUsage, VideoPipeline, PipelineError as VideoPipelineError, type VideoScript, calculateCost, formatCost };
