# multi-agent-video-pipeline

Turn any text prompt into a full `.mp4` video. Four agents, fully wired up.

```bash
npm install multi-agent-video-pipeline
```

```typescript
import { VideoPipeline } from 'multi-agent-video-pipeline'

// Script + audio only (3 agents)
const pipeline = new VideoPipeline({
  anthropicApiKey:  process.env.ANTHROPIC_API_KEY!,
  tavilyApiKey:     process.env.TAVILY_API_KEY!,
  elevenLabsApiKey: process.env.ELEVENLABS_API_KEY!,
})

// Full video with Veo 3 (4 agents)
const pipeline = new VideoPipeline({
  anthropicApiKey:  process.env.ANTHROPIC_API_KEY!,
  tavilyApiKey:     process.env.TAVILY_API_KEY!,
  elevenLabsApiKey: process.env.ELEVENLABS_API_KEY!,
  googleAiApiKey:   process.env.GOOGLE_AI_API_KEY!,  // ai.google.dev
  generateVideo:    true,
})

const result = await pipeline.run('How does the immune system work?')

console.log(result.script.fullText)    // narration text
console.log(result.audio.filePath)     // saved .mp3
console.log(result.video?.filePath)    // saved .mp4 (if generateVideo: true)
console.log(result.totalCostFormatted) // '$0.031'
```

## How it works

```
prompt → [Web Search] → [Script Writer] → [Audio Gen] → [Video Gen] → .mp4
```

Each agent passes structured data to the next — not raw text dumps. Claude only sees what it needs at each step, keeping costs low and quality high.

## Agents

- **Web Search** — Tavily search + Claude synthesizes into clean facts
- **Script Writer** — turns facts into a timed script with sections and visual notes
- **Audio Gen** — ElevenLabs TTS, voice auto-matched to script tone
- **Video Gen** — Veo 3 generates one video clip per section, FFmpeg assembles with audio

## Full docs

**[→ Read the full documentation](https://github.com/laxmanclo/multi-agent-kit/blob/main/docs/README.md)**

Covers: all options, result shape, traces, error handling, voice selection, Veo 3 notes, cost.

## API keys

| Service | Link | Free tier |
|---|---|---|
| Anthropic | console.anthropic.com | $5 credit |
| Tavily | tavily.com | 1k searches/month |
| ElevenLabs | elevenlabs.io | 10k chars/month |
| Google AI | ai.google.dev | Paid plan for Veo 3 |

## License

MIT
