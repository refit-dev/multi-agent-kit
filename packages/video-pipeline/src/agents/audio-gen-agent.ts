/**
 * AudioGenAgent — ElevenLabs TTS
 *
 * Takes the script's fullText and generates high-quality audio via ElevenLabs.
 * Returns both a Buffer (for in-memory use) and saves a .mp3 file.
 *
 * ElevenLabs advantages over OpenAI TTS:
 * - More natural prosody / emotion
 * - Better handling of long-form content
 * - Voice cloning support (future)
 * - Better pacing for video narration
 *
 * Context received: script.fullText + script.tone (affects voice selection)
 * Context produced: AudioOutput with buffer + file path
 */

import { writeFile, mkdir } from 'fs/promises'
import { join, resolve } from 'path'
import type { PipelineContext, AudioOutput, TTSVoice } from '../types.js'
import { PipelineError } from '../types.js'

const ELEVENLABS_API = 'https://api.elevenlabs.io/v1'

// Curated voice map — matched to script tone
// These are ElevenLabs built-in voices (no cloning required)
const TONE_TO_VOICE: Record<string, { voiceId: string; name: string }> = {
  educational:  { voiceId: 'pNInz6obpgDQGcFmaJgB', name: 'Adam' },     // clear, authoritative
  professional: { voiceId: 'ErXwobaYiN019PkySvjV', name: 'Antoni' },   // confident, smooth
  casual:       { voiceId: 'VR6AewLTigWG4xSOukaG', name: 'Arnold' },   // warm, conversational
  energetic:    { voiceId: 'yoZ06aMxZJJ28mfd3POQ', name: 'Sam' },      // upbeat, engaging
}

const DEFAULT_VOICE = TONE_TO_VOICE['educational']

interface ElevenLabsConfig {
  voiceId?: string
  modelId?: string          // default: eleven_turbo_v2_5 (fast + quality)
  stability?: number        // 0-1, default: 0.5
  similarityBoost?: number  // 0-1, default: 0.75
  style?: number            // 0-1, default: 0.3
  speakerBoost?: boolean
}

export async function audioGenAgent(ctx: PipelineContext): Promise<AudioOutput> {
  if (!ctx.script) {
    throw new PipelineError('AudioGenAgent requires script in context', 'audio-gen')
  }

  const { config, script } = ctx
  const startMs = Date.now()

  if (!config.elevenLabsApiKey) {
    throw new PipelineError('elevenLabsApiKey is required in config', 'audio-gen')
  }

  ctx.config.onProgress?.({
    stage: 'generating-audio',
    message: `Generating audio for ${script.wordCount} words via ElevenLabs`,
  })

  // Pick voice based on script tone
  const selectedVoice = TONE_TO_VOICE[script.tone] ?? DEFAULT_VOICE
  const voiceId = config.elevenLabsVoiceId ?? selectedVoice.voiceId

  // Build TTS request
  const ttsConfig: ElevenLabsConfig = {
    modelId: config.elevenLabsModel ?? 'eleven_turbo_v2_5',
    stability: 0.5,
    similarityBoost: 0.75,
    style: script.tone === 'energetic' ? 0.6 : 0.3,
    speakerBoost: true,
  }

  const response = await fetch(
    `${ELEVENLABS_API}/text-to-speech/${voiceId}`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': config.elevenLabsApiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text: script.fullText,
        model_id: ttsConfig.modelId,
        voice_settings: {
          stability: ttsConfig.stability,
          similarity_boost: ttsConfig.similarityBoost,
          style: ttsConfig.style,
          use_speaker_boost: ttsConfig.speakerBoost,
        },
      }),
    }
  )

  if (!response.ok) {
    const errText = await response.text().catch(() => response.statusText)
    throw new PipelineError(
      `ElevenLabs TTS failed: ${response.status} — ${errText}`,
      'audio-gen'
    )
  }

  const audioArrayBuffer = await response.arrayBuffer()
  const buffer = Buffer.from(audioArrayBuffer)

  // Save to disk
  const outputDir = resolve(config.outputDir ?? './output')
  await mkdir(outputDir, { recursive: true })

  const fileName = `audio_${Date.now()}.mp3`
  const filePath = join(outputDir, fileName)
  await writeFile(filePath, buffer)

  // Estimate duration: ~150 words/minute for video narration
  const estimatedDuration = (script.wordCount / 150) * 60

  return {
    filePath,
    buffer,
    durationSeconds: estimatedDuration,
    fileSizeBytes: buffer.length,
    voice: selectedVoice.name as TTSVoice,
    model: ttsConfig.modelId!,
    durationMs: Date.now() - startMs,
  }
}
