/**
 * VideoGenAgent
 *
 * Receives the full pipeline context (search results + script + audio)
 * and assembles a proper video:
 *
 * 1. For each script section, generate an image via DALL-E 3
 *    (prompt built from section title + visualNotes + topic)
 * 2. Download all images
 * 3. Use FFmpeg to combine images + audio into an .mp4
 *    - Each image holds for its section's durationSeconds
 *    - Audio track is the ElevenLabs narration
 *
 * Output: VideoOutput with filePath to the final .mp4
 *
 * Requires: ffmpeg installed on the system (brew install ffmpeg / apt install ffmpeg)
 */

import OpenAI from 'openai'
import ffmpeg from 'fluent-ffmpeg'
import { writeFileSync } from 'fs'
import { writeFile, mkdir, rm } from 'fs/promises'
import { join, resolve } from 'path'
import type { PipelineContext, VideoOutput } from '../types.js'
import { PipelineError } from '../types.js'

export async function videoGenAgent(ctx: PipelineContext): Promise<VideoOutput> {
  if (!ctx.script) throw new PipelineError('videoGenAgent requires script in context', 'video-gen')
  if (!ctx.audio)  throw new PipelineError('videoGenAgent requires audio in context', 'video-gen')
  if (!ctx.config.openaiApiKey) throw new PipelineError('openaiApiKey required for video generation', 'video-gen')

  const { config, script, audio, searchResults } = ctx
  const startMs = Date.now()

  config.onProgress?.({ stage: 'generating-images', message: `Generating ${script.sections.length} images with DALL-E 3` })

  const openai = new OpenAI({ apiKey: config.openaiApiKey })
  const outputDir = resolve(config.outputDir ?? './output')
  const tempDir = join(outputDir, `temp_${Date.now()}`)
  await mkdir(tempDir, { recursive: true })

  // ── Step 1: Generate one image per script section ─────────────────────────

  const imagePaths: string[] = []

  for (let i = 0; i < script.sections.length; i++) {
    const section = script.sections[i]

    // Build a focused image prompt from: topic + section title + visual notes
    const imagePrompt = buildImagePrompt({
      topic: ctx.query,
      sectionTitle: section.title,
      visualNotes: section.visualNotes,
      tone: script.tone,
    })

    const imageResponse = await openai.images.generate({
      model: 'dall-e-3',
      prompt: imagePrompt,
      size: '1792x1024',   // 16:9 widescreen
      quality: 'standard',
      n: 1,
    })

    const imageUrl = imageResponse.data?.[0]?.url
    if (!imageUrl) throw new PipelineError(`DALL-E returned no image for section ${i + 1}`, 'video-gen')

    // Download the image
    const imageBuffer = await fetch(imageUrl).then(r => r.arrayBuffer())
    const imagePath = join(tempDir, `section_${String(i).padStart(3, '0')}.jpg`)
    await writeFile(imagePath, Buffer.from(imageBuffer))
    imagePaths.push(imagePath)

    config.onProgress?.({
      stage: 'generating-images',
      message: `Generated image ${i + 1}/${script.sections.length}: ${section.title}`,
    })
  }

  // ── Step 2: Assemble video with FFmpeg ────────────────────────────────────

  config.onProgress?.({ stage: 'assembling-video', message: 'Assembling video with FFmpeg' })

  const videoFileName = `video_${Date.now()}.mp4`
  const videoPath = join(outputDir, videoFileName)

  await assembleVideo({
    imagePaths,
    durations: script.sections.map(s => s.durationSeconds),
    audioPath: audio.filePath,
    outputPath: videoPath,
    tempDir,
  })

  // Cleanup temp images
  await rm(tempDir, { recursive: true, force: true })

  return {
    filePath: videoPath,
    durationSeconds: script.totalDurationSeconds,
    sections: script.sections.length,
    imagesGenerated: imagePaths.length,
    durationMs: Date.now() - startMs,
  }
}

// ── Image prompt builder ──────────────────────────────────────────────────────

function buildImagePrompt(params: {
  topic: string
  sectionTitle: string
  visualNotes?: string
  tone: string
}): string {
  const styleMap: Record<string, string> = {
    educational: 'clean, informative illustration, professional style, bright colors',
    casual:      'friendly, approachable style, warm colors, modern design',
    professional:'corporate, clean design, blue tones, minimalist',
    energetic:   'dynamic, bold colors, high energy composition',
  }
  const style = styleMap[params.tone] ?? styleMap['educational']

  const parts = [
    `Topic: ${params.topic}`,
    `Scene: ${params.sectionTitle}`,
    params.visualNotes ? `Show: ${params.visualNotes}` : '',
    `Style: ${style}`,
    'No text overlays. Cinematic 16:9 composition. High quality.',
  ].filter(Boolean)

  return parts.join('. ')
}

// ── FFmpeg video assembly ─────────────────────────────────────────────────────

function assembleVideo(params: {
  imagePaths: string[]
  durations: number[]
  audioPath: string
  outputPath: string
  tempDir: string
}): Promise<void> {
  return new Promise((resolve, reject) => {
    // Write a concat file for FFmpeg with exact durations per image
    const concatLines = params.imagePaths.map((p, i) => [
      `file '${p}'`,
      `duration ${params.durations[i]}`,
    ]).flat()
    // FFmpeg concat demuxer needs the last file listed twice
    concatLines.push(`file '${params.imagePaths[params.imagePaths.length - 1]}'`)

    const concatFile = join(params.tempDir, 'concat.txt')
    writeFileSync(concatFile, concatLines.join('\n'))

    ffmpeg()
      .input(concatFile)
      .inputOptions(['-f concat', '-safe 0'])
      .input(params.audioPath)
      .videoCodec('libx264')
      .audioCodec('aac')
      .outputOptions([
        '-pix_fmt yuv420p',    // broad compatibility
        '-shortest',           // end when audio ends
        '-movflags +faststart', // web-optimised
        '-vf scale=1920:1080:flags=lanczos,fps=30',
      ])
      .output(params.outputPath)
      .on('end', () => resolve())
      .on('error', (err) => reject(new PipelineError(`FFmpeg error: ${err.message}`, 'video-gen', err)))
      .run()
  })
}
