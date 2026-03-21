# multi-agent-video-pipeline

Turn a text prompt into a full `.mp4` video. Four agents run in sequence — each one hands structured context to the next.

---

## Install

```bash
npm install multi-agent-video-pipeline
```

You also need **ffmpeg** installed on your machine:
```bash
brew install ffmpeg       # macOS
apt install ffmpeg        # Ubuntu/Debian
```

---

## API keys needed

```bash
ANTHROPIC_API_KEY=sk-ant-...      # claude.ai → API keys
TAVILY_API_KEY=tvly-...           # tavily.com → free tier
ELEVENLABS_API_KEY=...            # elevenlabs.io → free tier
OPENAI_API_KEY=sk-...             # openai.com → for DALL-E 3 images
```

---

## Run the full pipeline (prompt → .mp4)

```typescript
import { VideoPipeline } from 'multi-agent-video-pipeline'

const pipeline = new VideoPipeline({
  anthropicApiKey: process.env.ANTHROPIC_API_KEY!,
  tavilyApiKey: process.env.TAVILY_API_KEY!,
  elevenLabsApiKey: process.env.ELEVENLABS_API_KEY!,
  openaiApiKey: process.env.OPENAI_API_KEY!,

  generateVideo: true,            // run all 4 agents including video assembly
  scriptTargetDuration: 60,       // target video length in seconds
  outputDir: './output',          // where to save .mp3 and .mp4

  onProgress: ({ stage, message }) => console.log(`[${stage}] ${message}`),
})

const result = await pipeline.run('How does the human immune system work?')

console.log(result.video!.filePath)    // './output/video_1234567890.mp4'
console.log(result.audio.filePath)     // './output/audio_1234567890.mp3'
console.log(result.script.fullText)    // the full narration text
console.log(result.totalCostFormatted) // e.g. '$0.18'
```

---

## How the 4 agents work

```
Your prompt
    │
    ▼
[1] Web Search Agent
    Tools: Tavily search API + Claude synthesis
    → Searches the web for up-to-date information
    → Claude reads results and extracts key facts
    Passes to next agent: { keyFacts[], synthesis, sources[] }
    │
    ▼
[2] Script Writer Agent
    Tools: Claude Sonnet
    → Receives the key facts (structured data, not raw HTML)
    → Writes a video script: sections, timing, and visual notes per scene
    Passes to next agent: { sections[], fullText, tone, totalDurationSeconds }
    │
    ▼
[3] Audio Gen Agent
    Tools: ElevenLabs TTS
    → Receives the script text
    → Auto-picks a voice based on tone (educational, casual, professional, energetic)
    → Generates narration and saves .mp3
    Passes to next agent: { filePath, buffer, durationSeconds }
    │
    ▼
[4] Video Gen Agent
    Tools: DALL-E 3 + FFmpeg
    → Receives script sections + audio file
    → Generates one image per section using DALL-E 3 (1792×1024, 16:9)
    → FFmpeg assembles: images timed to each section + audio track → .mp4
    Output: { filePath, durationSeconds, sections, imagesGenerated }
```

**Each agent only receives what it needs.** The Web Search agent never touches the audio file. The Video Gen agent never re-runs the search. Clean, structured context flows forward — no raw dumps, no token waste.

---

## Skip the video (script + audio only)

If you don't need the `.mp4`, just omit `generateVideo`:

```typescript
const pipeline = new VideoPipeline({
  anthropicApiKey: process.env.ANTHROPIC_API_KEY!,
  tavilyApiKey: process.env.TAVILY_API_KEY!,
  elevenLabsApiKey: process.env.ELEVENLABS_API_KEY!,
  // no openaiApiKey needed
  // no ffmpeg needed
})

const result = await pipeline.run('Why is the sky blue?')

console.log(result.script.fullText)   // narration
console.log(result.audio.filePath)    // saved .mp3
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
  openaiApiKey?: string           // required only if generateVideo: true

  // Optional
  generateVideo?: boolean         // default: false
  scriptTargetDuration?: number   // seconds, default: 60
  searchMaxResults?: number       // sources to pull, default: 5
  elevenLabsVoiceId?: string      // override auto voice selection
  outputDir?: string              // default: './output'
  onProgress?: (event) => void    // progress callback
})
```

Progress stages in order:
```
'searching' → 'synthesizing' → 'writing-script' → 'generating-audio' → 'generating-images' → 'assembling-video' → 'done'
```

---

## What you get back

```typescript
const result = await pipeline.run('...')

// Script (from Agent 2)
result.script.title               // 'How the Immune System Works'
result.script.fullText            // complete narration
result.script.sections            // [{ type, title, content, durationSeconds, visualNotes }]
result.script.tone                // 'educational' | 'casual' | 'professional' | 'energetic'
result.script.totalDurationSeconds

// Audio (from Agent 3)
result.audio.filePath             // './output/audio_1234.mp3'
result.audio.buffer               // raw Buffer — upload to S3, send over HTTP, etc.
result.audio.durationSeconds

// Video (from Agent 4, if generateVideo: true)
result.video?.filePath            // './output/video_1234.mp4'
result.video?.durationSeconds
result.video?.imagesGenerated     // number of DALL-E images generated

// Research (from Agent 1)
result.searchResults.keyFacts     // ['fact 1', 'fact 2', ...]
result.searchResults.synthesis    // paragraph summary
result.searchResults.sources      // ['https://...', ...]

// Cost + timing
result.totalCostFormatted         // '$0.18'
result.totalDurationMs            // 45000
result.totalTokens                // 4200
```

---

## See exactly what each agent did

```typescript
result.traces.forEach(t => {
  console.log(`${t.agentName}: ${t.durationMs}ms ${t.costFormatted ?? ''}`)
  console.log(`  in:  ${t.inputSummary}`)
  console.log(`  out: ${t.outputSummary}`)
})

// Web Search Agent:    2341ms $0.008
//   in:  Searched "immune system", found 5 sources, extracted 6 key facts
//   out: T cells, B cells, antigens...
// Script Writer Agent: 1823ms $0.012
//   in:  Received 6 facts, wrote 142-word script in 4 sections
//   out: "How Your Immune System Works" — 60s, educational tone
// Audio Gen Agent:     4201ms
//   in:  Received 142-word script, generating audio with ElevenLabs voice: Adam
//   out: Saved to ./output/audio_1234.mp3 (384 KB, ~74s)
// Video Gen Agent:     38000ms
//   in:  4 script sections + audio at ./output/audio_1234.mp3
//   out: Video saved to ./output/video_1234.mp4 (4 scenes, ~60s)
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
    // err.agent = 'web-search' | 'script-writer' | 'audio-gen' | 'video-gen' | 'pipeline'
  }
}
```

---

## Voices

ElevenLabs voice is auto-selected based on script tone:

| Tone | Voice | Style |
|---|---|---|
| educational | Adam | Clear, authoritative |
| professional | Antoni | Confident, smooth |
| casual | Arnold | Warm, conversational |
| energetic | Sam | Upbeat, engaging |

Override with any ElevenLabs voice ID:
```typescript
elevenLabsVoiceId: 'your-elevenlabs-voice-id'
```

---

## Cost

Typical 60-second video with all 4 agents:

| Agent | API | Cost |
|---|---|---|
| Web Search | Tavily + Claude Sonnet | ~$0.008 |
| Script Writer | Claude Sonnet | ~$0.012 |
| Audio Gen | ElevenLabs Turbo | ~$0.005 |
| Video Gen | DALL-E 3 × 4 images | ~$0.16 |
| **Total** | | **~$0.185 per video** |

Script + audio only (no video): ~$0.025 per run.
