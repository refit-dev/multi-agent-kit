# multi-agent-video-pipeline

> Turn any text prompt into a video script + audio narration using 3 coordinated AI agents.

```bash
npm install multi-agent-video-pipeline
```

## How it works

```
User prompt
    │
    ▼
┌─────────────────────┐
│  Web Search Agent   │  Tavily → Claude synthesis → structured facts
└──────────┬──────────┘
           │  { keyFacts[], synthesis, sources[] }
           ▼
┌─────────────────────┐
│ Script Writer Agent │  Claude → structured script with sections + visual notes
└──────────┬──────────┘
           │  { sections[], fullText, timing }
           ▼
┌─────────────────────┐
│  Audio Gen Agent    │  ElevenLabs → .mp3 file (voice auto-matched to tone)
└─────────────────────┘
```

Each agent receives only the structured output of the previous one — not raw text dumps. This is proper context management.

## Usage

```typescript
import { VideoPipeline } from 'multi-agent-video-pipeline'

const pipeline = new VideoPipeline({
  anthropicApiKey: process.env.ANTHROPIC_API_KEY!,
  tavilyApiKey: process.env.TAVILY_API_KEY!,
  elevenLabsApiKey: process.env.ELEVENLABS_API_KEY!,

  scriptTargetDuration: 90,   // seconds
  outputDir: './output',
  onProgress: (e) => console.log(`[${e.stage}] ${e.message}`),
})

const result = await pipeline.run('Explain how black holes form')

console.log(result.script.title)           // "How Black Holes Form"
console.log(result.script.sections)        // [{type: 'intro', content: '...', durationSeconds: 10}, ...]
console.log(result.audio.filePath)         // './output/audio_1234567890.mp3'
console.log(result.totalCostFormatted)     // '$0.0234'

// Full agent traces — see exactly what each agent did
result.traces.forEach(t => {
  console.log(`${t.agentName}: ${t.durationMs}ms — ${t.costFormatted ?? 'no cost'}`)
  console.log(`  Input:  ${t.inputSummary}`)
  console.log(`  Output: ${t.outputSummary}`)
})
```

## Config

```typescript
interface PipelineConfig {
  anthropicApiKey: string      // Claude for search synthesis + script writing
  tavilyApiKey: string         // Web search (get free key at tavily.com)
  elevenLabsApiKey: string     // Audio generation

  scriptTargetDuration?: number   // Target video length in seconds (default: 60)
  searchMaxResults?: number       // Max search results (default: 5)
  elevenLabsVoiceId?: string      // Override auto voice selection
  elevenLabsModel?: string        // default: 'eleven_turbo_v2_5'
  outputDir?: string              // Audio output directory (default: './output')
  onProgress?: (event) => void    // Progress callback
}
```

## Result

```typescript
interface PipelineResult {
  query: string
  searchResults: {
    results: SearchResult[]   // raw search hits with scores
    synthesis: string         // Claude's synthesis paragraph
    keyFacts: string[]        // bullet points used by script writer
    sources: string[]         // URLs
  }
  script: {
    title: string
    sections: ScriptSection[] // [{type, content, durationSeconds, visualNotes}]
    fullText: string          // complete narration (fed to TTS)
    wordCount: number
    tone: 'educational' | 'casual' | 'professional' | 'energetic'
    totalDurationSeconds: number
  }
  audio: {
    filePath: string          // saved .mp3 path
    buffer: Buffer            // raw audio bytes
    durationSeconds: number
    fileSizeBytes: number
    voice: string
  }
  traces: AgentTrace[]        // full observability — what each agent did
  totalCostUsd: number
  totalCostFormatted: string  // e.g. '$0.023'
  totalDurationMs: number
  totalTokens: number
}
```

## API keys

| Service | Get key | Free tier |
|---|---|---|
| Anthropic | console.anthropic.com | $5 credit on signup |
| Tavily | tavily.com | 1,000 searches/month free |
| ElevenLabs | elevenlabs.io | 10,000 chars/month free |

## License

MIT
