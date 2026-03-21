/**
 * VideoGenAgent
 *
 * Receives the full pipeline context (script + audio) and produces a .mp4:
 *
 * 1. For each script section, generate an 8-second video clip via Veo 3
 *    (Google AI Studio API — just a GOOGLE_AI_API_KEY, no GCP project needed)
 * 2. Loop/extend each clip to match the section's durationSeconds
 * 3. Concatenate all clips + overlay the ElevenLabs audio with FFmpeg
 *
 * Output: VideoOutput with filePath to the final .mp4
 *
 * Requires: ffmpeg installed (brew install ffmpeg / apt install ffmpeg)
 *
 * Veo 3 limits: 8 seconds per clip, 720p/1080p, 16:9 or 9:16.
 * Longer sections are covered by looping the clip seamlessly.
 * Generation takes 30s–6min per clip depending on load.
 */

import ffmpeg from 'fluent-ffmpeg'
import { writeFileSync } from 'fs'
import { writeFile, mkdir, rm } from 'fs/promises'
import { join, resolve } from 'path'
import type { PipelineContext, VideoOutput } from '../types.js'
import { PipelineError } from '../types.js'

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta'
const VEO3_MODEL  = 'veo-3.0-generate-preview'

// ── Main agent ────────────────────────────────────────────────────────────────

export async function videoGenAgent(ctx: PipelineContext): Promise<VideoOutput> {
  if (!ctx.script) throw new PipelineError('videoGenAgent requires script in context', 'video-gen')
  if (!ctx.audio)  throw new PipelineError('videoGenAgent requires audio in context', 'video-gen')
  if (!ctx.config.googleAiApiKey) throw new PipelineError('googleAiApiKey required for video generation (get one at ai.google.dev)', 'video-gen')

  const { config, script, audio } = ctx
  const startMs  = Date.now()
  const apiKey   = config.googleAiApiKey!   // checked above
  const outputDir = resolve(config.outputDir ?? './output')
  const tempDir   = join(outputDir, `temp_${Date.now()}`)
  await mkdir(tempDir, { recursive: true })

  config.onProgress?.({ stage: 'generating-video', message: `Generating ${script.sections.length} clips with Veo 3` })

  // ── Step 1: Generate one Veo 3 clip per section ───────────────────────────

  const clipPaths: string[] = []

  for (let i = 0; i < script.sections.length; i++) {
    const section = script.sections[i]

    config.onProgress?.({
      stage: 'generating-video',
      message: `Generating clip ${i + 1}/${script.sections.length}: ${section.title}`,
    })

    const prompt     = buildVideoPrompt({ topic: ctx.query, section: section.title, visualNotes: section.visualNotes, tone: script.tone })
    const rawPath    = join(tempDir, `raw_${String(i).padStart(3, '0')}.mp4`)
    const extPath    = join(tempDir, `ext_${String(i).padStart(3, '0')}.mp4`)

    await generateVeo3Clip({ prompt, outputPath: rawPath, apiKey })
    await extendClip(rawPath, section.durationSeconds, extPath)
    clipPaths.push(extPath)
  }

  // ── Step 2: Concatenate clips + overlay audio ─────────────────────────────

  config.onProgress?.({ stage: 'assembling-video', message: 'Assembling final video with FFmpeg' })

  const videoPath = join(outputDir, `video_${Date.now()}.mp4`)
  await assembleVideo({ clipPaths, audioPath: audio.filePath, outputPath: videoPath, tempDir })

  await rm(tempDir, { recursive: true, force: true })

  return {
    filePath: videoPath,
    durationSeconds: script.totalDurationSeconds,
    sections: script.sections.length,
    clipsGenerated: clipPaths.length,
    durationMs: Date.now() - startMs,
  }
}

// ── Veo 3 generation (Google AI Studio API) ───────────────────────────────────

async function generateVeo3Clip(params: {
  prompt: string
  outputPath: string
  apiKey: string
}): Promise<void> {
  // 1. Start generation — returns an LRO (long-running operation)
  const initRes = await fetch(
    `${GEMINI_BASE}/models/${VEO3_MODEL}:generateVideo?key=${params.apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: { text: params.prompt },
        generationConfig: {
          durationSeconds: 8,   // Veo 3 max per clip
          aspectRatio: '16:9',
          resolution: '720p',
        },
      }),
    }
  )

  if (!initRes.ok) {
    const body = await initRes.text()
    throw new PipelineError(`Veo 3 start failed (${initRes.status}): ${body}`, 'video-gen')
  }

  const operation = await initRes.json() as { name: string; done?: boolean }

  // 2. Poll until done (typically 30s–6min)
  let poll: any = operation
  while (!poll.done) {
    await sleep(5000)
    const pollRes = await fetch(`${GEMINI_BASE}/${poll.name}?key=${params.apiKey}`)
    if (!pollRes.ok) {
      const body = await pollRes.text()
      throw new PipelineError(`Veo 3 poll failed (${pollRes.status}): ${body}`, 'video-gen')
    }
    poll = await pollRes.json()
  }

  if (poll.error) {
    throw new PipelineError(`Veo 3 error: ${poll.error.message ?? JSON.stringify(poll.error)}`, 'video-gen')
  }

  // 3. Extract video — either a downloadable URI or inline base64
  const samples = poll.response?.generateVideoResponse?.generatedSamples
  if (!samples?.length) {
    throw new PipelineError('Veo 3 returned no video samples', 'video-gen')
  }

  const video = samples[0].video
  if (!video) throw new PipelineError('Veo 3 sample has no video field', 'video-gen')

  if (video.uri) {
    // Download from URI (Vertex AI / GCS path)
    const dlRes = await fetch(`${video.uri}&key=${params.apiKey}`)
    if (!dlRes.ok) throw new PipelineError(`Failed to download Veo 3 video: ${dlRes.status}`, 'video-gen')
    await writeFile(params.outputPath, Buffer.from(await dlRes.arrayBuffer()))
  } else if (video.bytesBase64Encoded) {
    // Inline base64 response
    await writeFile(params.outputPath, Buffer.from(video.bytesBase64Encoded, 'base64'))
  } else {
    throw new PipelineError('Veo 3 response has no uri or bytesBase64Encoded', 'video-gen')
  }
}

// ── FFmpeg helpers ────────────────────────────────────────────────────────────

/** Loop a clip with -stream_loop so it fills targetSeconds exactly */
function extendClip(inputPath: string, targetSeconds: number, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(inputPath)
      .inputOptions(['-stream_loop -1'])
      .outputOptions([`-t ${targetSeconds}`, '-c:v copy', '-an'])
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', (err) => reject(new PipelineError(`FFmpeg extend error: ${err.message}`, 'video-gen', err)))
      .run()
  })
}

/** Concatenate extended clips + overlay ElevenLabs audio → final .mp4 */
function assembleVideo(params: {
  clipPaths: string[]
  audioPath: string
  outputPath: string
  tempDir: string
}): Promise<void> {
  return new Promise((resolve, reject) => {
    const concatFile = join(params.tempDir, 'concat.txt')
    writeFileSync(concatFile, params.clipPaths.map(p => `file '${p}'`).join('\n'))

    ffmpeg()
      .input(concatFile)
      .inputOptions(['-f concat', '-safe 0'])
      .input(params.audioPath)
      .videoCodec('libx264')
      .audioCodec('aac')
      .outputOptions([
        '-pix_fmt yuv420p',      // broad compatibility
        '-shortest',             // end when audio ends
        '-movflags +faststart',  // web-optimised
        '-vf scale=1920:1080:flags=lanczos,fps=30',
      ])
      .output(params.outputPath)
      .on('end', () => resolve())
      .on('error', (err) => reject(new PipelineError(`FFmpeg assembly error: ${err.message}`, 'video-gen', err)))
      .run()
  })
}

// ── Prompt builder ────────────────────────────────────────────────────────────

function buildVideoPrompt(params: {
  topic: string
  section: string
  visualNotes?: string
  tone: string
}): string {
  const styleMap: Record<string, string> = {
    educational: 'documentary style, clean professional visuals, informative',
    casual:      'warm natural lighting, friendly and approachable, lifestyle footage',
    professional:'corporate, sleek design, professional setting, minimal',
    energetic:   'dynamic motion, bold visuals, high energy, cinematic',
  }
  const style = styleMap[params.tone] ?? styleMap['educational']

  const parts = [
    params.visualNotes ?? `${params.section} about ${params.topic}`,
    style,
    'Cinematic 16:9 widescreen. Smooth motion. No text overlays. High quality.',
  ]

  return parts.join('. ')
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}
