"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  VideoPipeline: () => VideoPipeline,
  VideoPipelineError: () => PipelineError,
  calculateCost: () => calculateCost,
  formatCost: () => formatCost
});
module.exports = __toCommonJS(index_exports);

// src/agents/web-search-agent.ts
var import_sdk = __toESM(require("@anthropic-ai/sdk"));

// src/types.ts
var PipelineError = class extends Error {
  constructor(message, agent, cause) {
    super(message);
    this.agent = agent;
    this.cause = cause;
    this.name = "PipelineError";
  }
};

// src/cost.ts
var PRICING = {
  "claude-opus-4-6": { input: 15, output: 75 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-haiku-4-5-20251001": { input: 0.8, output: 4 }
};
function calculateCost(model, inputTokens, outputTokens) {
  const p = PRICING[model] ?? PRICING["claude-sonnet-4-6"];
  return inputTokens / 1e6 * p.input + outputTokens / 1e6 * p.output;
}
function formatCost(usd) {
  if (usd < 1e-3) return "< $0.001";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

// src/agents/web-search-agent.ts
var TAVILY_API = "https://api.tavily.com/search";
async function webSearchAgent(ctx) {
  const { query, config } = ctx;
  const maxResults = config.searchMaxResults ?? 5;
  const startedAt = /* @__PURE__ */ new Date();
  const startMs = Date.now();
  ctx.config.onProgress?.({ stage: "searching", message: `Searching web for: "${query}"` });
  let tavilyResults = [];
  try {
    const response = await fetch(TAVILY_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.tavilyApiKey}`
      },
      body: JSON.stringify({
        query,
        max_results: maxResults,
        search_depth: "advanced",
        // deep crawl for better content
        include_answer: false,
        // we'll synthesize with Claude instead
        include_raw_content: false
      })
    });
    if (!response.ok) {
      throw new PipelineError(
        `Tavily search failed: ${response.status} ${response.statusText}`,
        "web-search"
      );
    }
    const data = await response.json();
    tavilyResults = data.results ?? [];
  } catch (err) {
    if (err instanceof PipelineError) throw err;
    throw new PipelineError(`Tavily request failed: ${String(err)}`, "web-search", err);
  }
  if (tavilyResults.length === 0) {
    throw new PipelineError(`No search results found for: "${query}"`, "web-search");
  }
  ctx.config.onProgress?.({ stage: "synthesizing", message: `Synthesizing ${tavilyResults.length} sources with Claude` });
  const client = new import_sdk.default({ apiKey: config.anthropicApiKey });
  const targetDuration = config.scriptTargetDuration ?? 60;
  const searchContext = tavilyResults.map((r, i) => `[Source ${i + 1}] ${r.title}
URL: ${r.url}
${r.content}`).join("\n\n---\n\n");
  const synthesisResponse = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: `You are a research analyst preparing facts for a ${targetDuration}-second video script.
Extract only the most important, verifiable, interesting facts from the sources.
Be accurate. Prioritize facts that are engaging for a general audience.
Respond with valid JSON only.`,
    messages: [{
      role: "user",
      content: `Query: "${query}"

Sources:
${searchContext}

Extract and return JSON in this exact format:
{
  "synthesis": "2-3 sentence overview of what the research found",
  "keyFacts": ["fact 1", "fact 2", "fact 3", "fact 4", "fact 5"],
  "primaryAngle": "the most interesting/surprising angle for a video about this topic"
}`
    }]
  });
  let synthesis = "";
  let keyFacts = [];
  try {
    const text = synthesisResponse.content[0].type === "text" ? synthesisResponse.content[0].text : "{}";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch?.[0] ?? "{}");
    synthesis = parsed.synthesis ?? "";
    keyFacts = parsed.keyFacts ?? [];
    if (parsed.primaryAngle) {
      synthesis = `${synthesis} ${parsed.primaryAngle}`;
    }
  } catch {
    synthesis = synthesisResponse.content[0].type === "text" ? synthesisResponse.content[0].text.slice(0, 500) : "";
    keyFacts = tavilyResults.map((r) => r.title);
  }
  const inputTokens = synthesisResponse.usage.input_tokens;
  const outputTokens = synthesisResponse.usage.output_tokens;
  const costUsd = calculateCost("claude-sonnet-4-6", inputTokens, outputTokens);
  const results = tavilyResults.map((r) => ({
    title: r.title,
    url: r.url,
    content: r.content,
    score: r.score,
    publishedDate: r.published_date
  }));
  return {
    query,
    results,
    synthesis,
    keyFacts,
    sources: results.map((r) => r.url),
    tokenUsage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens },
    durationMs: Date.now() - startMs
  };
}

// src/agents/script-writer-agent.ts
var import_sdk2 = __toESM(require("@anthropic-ai/sdk"));
async function scriptWriterAgent(ctx) {
  if (!ctx.searchResults) {
    throw new PipelineError("ScriptWriterAgent requires searchResults in context", "script-writer");
  }
  const { query, config, searchResults } = ctx;
  const targetDuration = config.scriptTargetDuration ?? 60;
  const startMs = Date.now();
  ctx.config.onProgress?.({ stage: "writing-script", message: `Writing ${targetDuration}s video script` });
  const client = new import_sdk2.default({ apiKey: config.anthropicApiKey });
  const researchContext = [
    `Topic: ${query}`,
    `Research Summary: ${searchResults.synthesis}`,
    `Key Facts:
${searchResults.keyFacts.map((f, i) => `${i + 1}. ${f}`).join("\n")}`,
    `Sources: ${searchResults.sources.slice(0, 3).join(", ")}`
  ].join("\n\n");
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    system: `You are an expert video script writer. Write engaging, clear scripts for YouTube/social media videos.
- Use conversational language (contractions, short sentences)
- Each word \u2248 0.5 seconds when spoken, so ${targetDuration}s = ~${targetDuration * 2} words
- Structure: hook intro, 2-3 main points, strong outro with CTA
- Visual notes tell the video editor what to show, NOT what to narrate
- Respond with valid JSON only`,
    messages: [{
      role: "user",
      content: `Write a ${targetDuration}-second video script about: "${query}"

Research to use:
${researchContext}

Return JSON in this exact format:
{
  "title": "video title",
  "targetAudience": "who this video is for",
  "tone": "educational|casual|professional|energetic",
  "sections": [
    {
      "id": "s1",
      "type": "intro",
      "title": "section title",
      "content": "exact narration text \u2014 what the narrator says",
      "durationSeconds": 10,
      "visualNotes": "what to show on screen during this section"
    }
  ]
}

Section types: intro (hook, 5-10s), main (key points, can repeat), transition (brief, 2-5s), outro (CTA, 5-10s).
Make sure total section durations sum to ~${targetDuration} seconds.`
    }]
  });
  const text = response.content[0].type === "text" ? response.content[0].text : "";
  let parsed;
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(jsonMatch?.[0] ?? "{}");
  } catch {
    throw new PipelineError("ScriptWriterAgent returned invalid JSON", "script-writer");
  }
  if (!parsed.sections?.length) {
    throw new PipelineError("ScriptWriterAgent returned no sections", "script-writer");
  }
  const sections = parsed.sections.map((s, i) => ({
    id: s.id ?? `s${i + 1}`,
    type: s.type ?? "main",
    title: s.title ?? `Section ${i + 1}`,
    content: s.content ?? "",
    durationSeconds: s.durationSeconds ?? Math.floor(targetDuration / parsed.sections.length),
    visualNotes: s.visualNotes
  }));
  const fullText = sections.map((s) => s.content).join(" ");
  const wordCount = fullText.split(/\s+/).filter(Boolean).length;
  const totalDuration = sections.reduce((sum, s) => sum + s.durationSeconds, 0);
  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;
  return {
    title: parsed.title ?? query,
    totalDurationSeconds: totalDuration,
    targetAudience: parsed.targetAudience ?? "General audience",
    tone: parsed.tone ?? "educational",
    sections,
    fullText,
    wordCount,
    tokenUsage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens },
    durationMs: Date.now() - startMs
  };
}

// src/agents/audio-gen-agent.ts
var import_promises = require("fs/promises");
var import_path = require("path");
var ELEVENLABS_API = "https://api.elevenlabs.io/v1";
var TONE_TO_VOICE = {
  educational: { voiceId: "pNInz6obpgDQGcFmaJgB", name: "Adam" },
  // clear, authoritative
  professional: { voiceId: "ErXwobaYiN019PkySvjV", name: "Antoni" },
  // confident, smooth
  casual: { voiceId: "VR6AewLTigWG4xSOukaG", name: "Arnold" },
  // warm, conversational
  energetic: { voiceId: "yoZ06aMxZJJ28mfd3POQ", name: "Sam" }
  // upbeat, engaging
};
var DEFAULT_VOICE = TONE_TO_VOICE["educational"];
async function audioGenAgent(ctx) {
  if (!ctx.script) {
    throw new PipelineError("AudioGenAgent requires script in context", "audio-gen");
  }
  const { config, script } = ctx;
  const startMs = Date.now();
  if (!config.elevenLabsApiKey) {
    throw new PipelineError("elevenLabsApiKey is required in config", "audio-gen");
  }
  ctx.config.onProgress?.({
    stage: "generating-audio",
    message: `Generating audio for ${script.wordCount} words via ElevenLabs`
  });
  const selectedVoice = TONE_TO_VOICE[script.tone] ?? DEFAULT_VOICE;
  const voiceId = config.elevenLabsVoiceId ?? selectedVoice.voiceId;
  const ttsConfig = {
    modelId: config.elevenLabsModel ?? "eleven_turbo_v2_5",
    stability: 0.5,
    similarityBoost: 0.75,
    style: script.tone === "energetic" ? 0.6 : 0.3,
    speakerBoost: true
  };
  const response = await fetch(
    `${ELEVENLABS_API}/text-to-speech/${voiceId}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": config.elevenLabsApiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg"
      },
      body: JSON.stringify({
        text: script.fullText,
        model_id: ttsConfig.modelId,
        voice_settings: {
          stability: ttsConfig.stability,
          similarity_boost: ttsConfig.similarityBoost,
          style: ttsConfig.style,
          use_speaker_boost: ttsConfig.speakerBoost
        }
      })
    }
  );
  if (!response.ok) {
    const errText = await response.text().catch(() => response.statusText);
    throw new PipelineError(
      `ElevenLabs TTS failed: ${response.status} \u2014 ${errText}`,
      "audio-gen"
    );
  }
  const audioArrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(audioArrayBuffer);
  const outputDir = (0, import_path.resolve)(config.outputDir ?? "./output");
  await (0, import_promises.mkdir)(outputDir, { recursive: true });
  const fileName = `audio_${Date.now()}.mp3`;
  const filePath = (0, import_path.join)(outputDir, fileName);
  await (0, import_promises.writeFile)(filePath, buffer);
  const estimatedDuration = script.wordCount / 150 * 60;
  return {
    filePath,
    buffer,
    durationSeconds: estimatedDuration,
    fileSizeBytes: buffer.length,
    voice: selectedVoice.name,
    model: ttsConfig.modelId,
    durationMs: Date.now() - startMs
  };
}

// src/pipeline.ts
var VideoPipeline = class {
  constructor(config) {
    this.validateConfig(config);
    this.config = config;
  }
  async run(query) {
    if (!query?.trim()) throw new PipelineError("Query cannot be empty", "pipeline");
    const startMs = Date.now();
    const ctx = {
      query: query.trim(),
      config: this.config,
      startedAt: /* @__PURE__ */ new Date(),
      traces: []
    };
    ctx.searchResults = await this.runAgent(
      ctx,
      "web-search",
      "Web Search Agent",
      () => webSearchAgent(ctx),
      (r) => `Searched "${query}", found ${r.results.length} sources, extracted ${r.keyFacts.length} key facts`,
      (r) => `${r.synthesis.slice(0, 120)}\u2026`,
      (r) => r.tokenUsage,
      (r) => calculateCost("claude-sonnet-4-6", r.tokenUsage.inputTokens, r.tokenUsage.outputTokens)
    );
    ctx.script = await this.runAgent(
      ctx,
      "script-writer",
      "Script Writer Agent",
      () => scriptWriterAgent(ctx),
      (r) => `Received ${ctx.searchResults.keyFacts.length} facts, wrote ${r.wordCount}-word script in ${r.sections.length} sections`,
      (r) => `"${r.title}" \u2014 ${r.totalDurationSeconds}s, ${r.tone} tone`,
      (r) => r.tokenUsage,
      (r) => calculateCost("claude-sonnet-4-6", r.tokenUsage.inputTokens, r.tokenUsage.outputTokens)
    );
    ctx.audio = await this.runAgent(
      ctx,
      "audio-gen",
      "Audio Gen Agent",
      () => audioGenAgent(ctx),
      (r) => `Received ${ctx.script.wordCount}-word script, generating audio with ElevenLabs voice: ${r.voice}`,
      (r) => `Saved to ${r.filePath} (${(r.fileSizeBytes / 1024).toFixed(1)} KB, ~${r.durationSeconds.toFixed(0)}s)`,
      void 0,
      void 0
    );
    this.config.onProgress?.({ stage: "done", message: "Pipeline complete!" });
    const totalCostUsd = ctx.traces.reduce((sum, t) => sum + (t.costUsd ?? 0), 0);
    const totalTokens = ctx.traces.reduce((sum, t) => sum + (t.tokenUsage?.totalTokens ?? 0), 0);
    return {
      query,
      searchResults: ctx.searchResults,
      script: ctx.script,
      audio: ctx.audio,
      traces: ctx.traces,
      totalCostUsd,
      totalCostFormatted: formatCost(totalCostUsd),
      totalDurationMs: Date.now() - startMs,
      totalTokens
    };
  }
  // ── Generic agent runner with tracing ──────────────────────────────────────
  async runAgent(ctx, agentId, agentName, fn, inputSummaryFn, outputSummaryFn, tokenUsageFn, costFn) {
    const startedAt = /* @__PURE__ */ new Date();
    const startMs = Date.now();
    let result;
    try {
      result = await fn();
    } catch (err) {
      const durationMs2 = Date.now() - startMs;
      const trace2 = {
        agentId,
        agentName,
        status: "error",
        inputSummary: `Failed at ${agentName}`,
        outputSummary: "",
        durationMs: durationMs2,
        error: err instanceof Error ? err.message : String(err),
        startedAt,
        completedAt: /* @__PURE__ */ new Date()
      };
      ctx.traces.push(trace2);
      if (err instanceof PipelineError) throw err;
      throw new PipelineError(`${agentName} failed: ${String(err)}`, agentId, err);
    }
    const durationMs = Date.now() - startMs;
    const tokenUsage = tokenUsageFn?.(result);
    const costUsd = costFn?.(result);
    const trace = {
      agentId,
      agentName,
      status: "success",
      inputSummary: inputSummaryFn(result),
      outputSummary: outputSummaryFn(result),
      tokenUsage,
      costUsd,
      costFormatted: costUsd !== void 0 ? formatCost(costUsd) : void 0,
      durationMs,
      startedAt,
      completedAt: /* @__PURE__ */ new Date()
    };
    ctx.traces.push(trace);
    return result;
  }
  validateConfig(config) {
    const required = ["anthropicApiKey", "tavilyApiKey", "elevenLabsApiKey"];
    for (const key of required) {
      if (!config[key]) {
        throw new PipelineError(`Missing required config: ${key}`, "pipeline");
      }
    }
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  VideoPipeline,
  VideoPipelineError,
  calculateCost,
  formatCost
});
