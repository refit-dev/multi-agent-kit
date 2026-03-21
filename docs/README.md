# multi-agent-video-pipeline

Turn a text prompt into a full `.mp4` video. Four agents run in sequence — each one hands structured context to the next.

---

## Install

```bash
npm install multi-agent-video-pipeline
```

You also need **ffmpeg** on your system:
```bash
brew install ffmpeg       # macOS
apt install ffmpeg        # Ubuntu/Debian
```

---

## API keys

```bash
# Required for all runs (3-agent: search → script → audio)
ANTHROPIC_API_KEY=sk-ant-...      # claude.ai → Settings → API Keys
TAVILY_API_KEY=tvly-...           # tavily.com → free tier
ELEVENLABS_API_KEY=...            # elevenlabs.io → free tier

# Required only for full video generation (Agent 4)
GOOGLE_AI_API_KEY=...             # ai.google.dev → Get API Key (paid plan for Veo 3)
```

See [`.env.example`](./.env.example) for the full template.

---

## Run the full pipeline (prompt → .mp4)

```typescript
import { VideoPipeline } from 'multi-agent-video-pipeline'

const pipeline = new VideoPipeline({
  anthropicApiKey:  process.env.ANTHROPIC_API_KEY!,
  tavilyApiKey:     process.env.TAVILY_API_KEY!,
  elevenLabsApiKey: process.env.ELEVENLABS_API_KEY!,
  googleAiApiKey:   process.env.GOOGLE_AI_API_KEY!,

  generateVideo: true,          // run all 4 agents including Veo 3
  scriptTargetDuration: 60,     // target length in seconds
  outputDir: './output',

  onProgress: ({ stage, message }) => console.log(`[${stage}] ${message}`),
})

const result = await pipeline.run('How does the human immune system work?')

console.log(result.video!.filePath)    // './output/video_1234567890.mp4'
console.log(result.audio.filePath)     // './output/audio_1234567890.mp3'
console.log(result.script.fullText)    // the narration text
console.log(result.totalCostFormatted) // e.g. '$0.05'
```

---

## How the 4 agents work

```
Your prompt
    │
    ▼
[1] Web Search Agent          (Tavily + Claude Sonnet)
    Searches the web, Claude reads results and extracts key facts
    → passes: { keyFacts[], synthesis, sources[] }
    │
    ▼
[2] Script Writer Agent       (Claude Sonnet)
    Receives key facts — not raw HTML, clean structured data
    Writes a timed script: sections, durations, visual notes per scene
    → passes: { sections[], fullText, tone, totalDurationSeconds }
    │
    ▼
[3] Audio Gen Agent           (ElevenLabs)
    Receives the script text, auto-picks a voice based on tone
    Generates narration → saves .mp3
    → passes: { filePath, buffer, durationSeconds }
    │
    ▼
[4] Video Gen Agent           (Veo 3 + FFmpeg)
    For each section: generates an 8-second video clip with Veo 3
    Loops each clip to fill the section's duration
    FFmpeg concatenates all clips + overlays the ElevenLabs audio → .mp4
    → output: { filePath, durationSeconds, clipsGenerated }
```

**Each agent only sees what it needs.** The web search agent never touches the audio. The video agent never re-runs the search. Clean context flows forward — no raw dumps, no wasted tokens.

---

## Skip the video (script + audio only)

No `openaiApiKey`, no `ffmpeg` needed:

```typescript
const pipeline = new VideoPipeline({
  anthropicApiKey:  process.env.ANTHROPIC_API_KEY!,
  tavilyApiKey:     process.env.TAVILY_API_KEY!,
  elevenLabsApiKey: process.env.ELEVENLABS_API_KEY!,
  // no googleAiApiKey needed
})

const result = await pipeline.run('Why is the sky blue?')

console.log(result.script.fullText)  // narration
console.log(result.audio.filePath)   // saved .mp3
// result.video is undefined
```

---

## Options

```typescript
new VideoPipeline({
  // Required
  anthropicApiKey: string
  tavilyApiKey: string
  elevenLabsApiKey: string

  // Required if generateVideo: true
  googleAiApiKey?: string         // from ai.google.dev

  // Optional
  generateVideo?: boolean         // default: false
  scriptTargetDuration?: number   // seconds, default: 60
  searchMaxResults?: number       // default: 5
  elevenLabsVoiceId?: string      // override auto voice selection
  outputDir?: string              // default: './output'
  onProgress?: (event) => void
})
```

Progress stages (in order):
```
'searching' → 'synthesizing' → 'writing-script' → 'generating-audio' → 'generating-video' → 'assembling-video' → 'done'
```

---

## What you get back

```typescript
const result = await pipeline.run('...')

// Script (Agent 2)
result.script.title
result.script.fullText            // complete narration
result.script.sections            // [{ type, title, content, durationSeconds, visualNotes }]
result.script.tone                // 'educational' | 'casual' | 'professional' | 'energetic'
result.script.totalDurationSeconds

// Audio (Agent 3)
result.audio.filePath             // './output/audio_1234.mp3'
result.audio.buffer               // raw Buffer — upload to S3, pass over HTTP, etc.
result.audio.durationSeconds

// Video (Agent 4 — only when generateVideo: true)
result.video?.filePath            // './output/video_1234.mp4'
result.video?.clipsGenerated      // number of Veo 3 clips generated
result.video?.durationSeconds

// Research (Agent 1)
result.searchResults.keyFacts     // ['fact 1', 'fact 2', ...]
result.searchResults.synthesis    // paragraph summary
result.searchResults.sources      // ['https://...', ...]

// Totals
result.totalCostFormatted         // '$0.05'
result.totalDurationMs
result.totalTokens
```

---

## Trace what each agent did

```typescript
result.traces.forEach(t => {
  console.log(`${t.agentName}: ${t.durationMs}ms ${t.costFormatted ?? ''}`)
  console.log(`  → ${t.outputSummary}`)
})

// Web Search Agent:    2341ms $0.008
//   → Searched "immune system", found 5 sources, extracted 6 key facts
// Script Writer Agent: 1823ms $0.012
//   → "How Your Immune System Works" — 60s, educational tone
// Audio Gen Agent:     4201ms
//   → Saved to ./output/audio_1234.mp3 (384 KB, ~74s)
// Video Gen Agent:     180000ms
//   → Video saved to ./output/video_1234.mp4 (4 Veo 3 clips, ~60s)
```

---

## Error handling

```typescript
import { VideoPipelineError } from 'multi-agent-video-pipeline'

try {
  const result = await pipeline.run('...')
} catch (err) {
  if (err instanceof VideoPipelineError) {
    console.error(`[${err.agent}] ${err.message}`)
    // err.agent: 'web-search' | 'script-writer' | 'audio-gen' | 'video-gen' | 'pipeline'
  }
}
```

---

## Voices

Auto-selected from script tone:

| Tone | Voice | Style |
|---|---|---|
| educational | Adam | Clear, authoritative |
| professional | Antoni | Confident, smooth |
| casual | Arnold | Warm, conversational |
| energetic | Sam | Upbeat, engaging |

Override: `elevenLabsVoiceId: 'your-voice-id'`

---

## Veo 3 notes

- Each clip is **8 seconds** (Veo 3 max per generation). Longer sections are filled by looping.
- Generation takes **30 seconds to 6 minutes** per clip depending on Google's load.
- A 60-second video with 4 sections = 4 Veo 3 calls (~2–24 min total generation time).
- Requires a **paid Google AI plan** — get your key at [ai.google.dev](https://ai.google.dev).

---

## Cost

Typical 60-second video:

| Agent | API | Cost |
|---|---|---|
| Web Search | Tavily + Claude Sonnet | ~$0.008 |
| Script Writer | Claude Sonnet | ~$0.012 |
| Audio Gen | ElevenLabs Turbo | ~$0.005 |
| Video Gen | Veo 3 (4 clips) | see Google AI pricing |
| **Total (no video)** | | **~$0.025** |
