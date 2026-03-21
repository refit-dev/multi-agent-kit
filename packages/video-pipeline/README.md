# multi-agent-video-pipeline

Turn any text prompt into a video script + audio. Three agents, fully wired up.

```bash
npm install multi-agent-video-pipeline
```

```typescript
import { VideoPipeline } from 'multi-agent-video-pipeline'

const pipeline = new VideoPipeline({
  anthropicApiKey: process.env.ANTHROPIC_API_KEY!,
  tavilyApiKey: process.env.TAVILY_API_KEY!,
  elevenLabsApiKey: process.env.ELEVENLABS_API_KEY!,
})

const result = await pipeline.run('How does the immune system work?')

console.log(result.script.fullText)    // narration text
console.log(result.audio.filePath)     // saved .mp3
console.log(result.totalCostFormatted) // '$0.031'
```

## How it works

```
Your prompt → [Web Search] → [Script Writer] → [Audio Gen] → script + .mp3
```

Each agent passes structured data to the next — not raw text dumps. Context management is built in: Claude only sees what it needs at each step, keeping costs low and quality high.

## Agents

- **Web Search** — Tavily search + Claude synthesizes results into clean facts
- **Script Writer** — turns facts into a timed video script with sections and visual notes  
- **Audio Gen** — ElevenLabs TTS, voice auto-matched to script tone

## Full docs

**[→ Read the full documentation](https://github.com/laxmanclo/multi-agent-kit/blob/main/docs/README.md)**

Covers: all options, what you get back, traces, error handling, voice selection, cost breakdown.

## API keys needed

| Service | Link | Free tier |
|---|---|---|
| Anthropic | console.anthropic.com | $5 credit |
| Tavily | tavily.com | 1k searches/month |
| ElevenLabs | elevenlabs.io | 10k chars/month |

## License

MIT
