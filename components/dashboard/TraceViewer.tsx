'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'

interface AgentTrace {
  id: string
  agentId: string
  agentName: string
  agentEmoji: string
  model: string
  input: string
  output: string
  routingReason: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  costUsd: number
  costFormatted: string
  contextUtilization: number
  durationMs: number
  feedback: 1 | -1 | null
  contextSnapshot: {
    systemPromptLength: number
    historyMessages: number
    sharedAgentRuns: number
  } | null
  createdAt: string
}

interface TraceSummary {
  totalRuns: number
  totalInputTokens: number
  totalOutputTokens: number
  totalTokens: number
  totalCostUsd: number
  totalCostFormatted: string
  agentsUsed: string[]
}

interface TraceViewerProps {
  conversationId: string | null
}

const AGENT_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  researcher: { bg: 'bg-blue-500/10',   text: 'text-blue-400',   border: 'border-blue-500/30' },
  coder:      { bg: 'bg-green-500/10',  text: 'text-green-400',  border: 'border-green-500/30' },
  analyst:    { bg: 'bg-yellow-500/10', text: 'text-yellow-400', border: 'border-yellow-500/30' },
  writer:     { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/30' },
  planner:    { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/30' },
}

function ContextUtilBar({ pct }: { pct: number }) {
  const color = pct >= 80 ? 'bg-red-500' : pct >= 50 ? 'bg-yellow-500' : 'bg-green-500'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-white/10 rounded-full h-1">
        <div className={`${color} rounded-full h-1 transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-zinc-400 w-8">{pct}%</span>
    </div>
  )
}

function TraceCard({ trace, index }: { trace: AgentTrace; index: number }) {
  const [expanded, setExpanded] = useState(false)
  const colors = AGENT_COLORS[trace.agentId] ?? { bg: 'bg-white/5', text: 'text-zinc-400', border: 'border-white/10' }

  return (
    <div className={`border rounded-lg ${colors.border} ${colors.bg} overflow-hidden`}>
      {/* Header — always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-white/5 transition-colors"
      >
        {/* Step indicator */}
        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${colors.text} border ${colors.border} shrink-0`}>
          {index + 1}
        </div>

        {/* Agent badge */}
        <span className="text-base">{trace.agentEmoji}</span>
        <span className={`text-sm font-medium ${colors.text}`}>{trace.agentName}</span>

        {/* Routing reason */}
        <span className="text-xs text-zinc-500 flex-1 truncate hidden sm:block">
          {trace.routingReason}
        </span>

        {/* Cost + tokens + duration */}
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs text-zinc-400">{trace.totalTokens.toLocaleString()} tok</span>
          <span className={`text-xs font-mono font-medium ${colors.text}`}>{trace.costFormatted}</span>
          <span className="text-xs text-zinc-600">{trace.durationMs}ms</span>
          <span className="text-zinc-600">{expanded ? '↑' : '↓'}</span>
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-white/10 pt-3">

          {/* Routing reason */}
          <div>
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Why this agent</p>
            <p className="text-sm text-zinc-300">{trace.routingReason}</p>
          </div>

          <Separator className="bg-white/10" />

          {/* Context snapshot */}
          {trace.contextSnapshot && (
            <div>
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Context given to agent</p>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="bg-white/5 rounded p-2 text-center">
                  <div className="text-white font-medium">{trace.contextSnapshot.historyMessages}</div>
                  <div className="text-zinc-500">history msgs</div>
                </div>
                <div className="bg-white/5 rounded p-2 text-center">
                  <div className="text-white font-medium">{trace.contextSnapshot.sharedAgentRuns}</div>
                  <div className="text-zinc-500">prior agents</div>
                </div>
                <div className="bg-white/5 rounded p-2 text-center">
                  <div className="text-white font-medium">{trace.contextSnapshot.systemPromptLength}</div>
                  <div className="text-zinc-500">prompt chars</div>
                </div>
              </div>
              <div className="mt-2">
                <p className="text-xs text-zinc-500 mb-1">Context window used</p>
                <ContextUtilBar pct={trace.contextUtilization} />
              </div>
            </div>
          )}

          <Separator className="bg-white/10" />

          {/* Input */}
          <div>
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Input</p>
            <p className="text-sm text-zinc-300 bg-white/5 rounded p-2 font-mono">{trace.input}</p>
          </div>

          {/* Output preview */}
          <div>
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Output</p>
            <p className="text-sm text-zinc-300 bg-white/5 rounded p-2 whitespace-pre-wrap line-clamp-6">
              {trace.output}
            </p>
          </div>

          <Separator className="bg-white/10" />

          {/* Token breakdown */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <p className="text-zinc-500 mb-1">Token breakdown</p>
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-zinc-400">Input</span>
                  <span className="text-white font-mono">{trace.inputTokens.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Output</span>
                  <span className="text-white font-mono">{trace.outputTokens.toLocaleString()}</span>
                </div>
                <div className="flex justify-between border-t border-white/10 pt-1">
                  <span className="text-zinc-400">Total</span>
                  <span className="text-white font-mono">{trace.totalTokens.toLocaleString()}</span>
                </div>
              </div>
            </div>
            <div>
              <p className="text-zinc-500 mb-1">Cost breakdown</p>
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-zinc-400">Model</span>
                  <span className="text-white font-mono text-xs">{trace.model.split('-').slice(1, 3).join('-')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Duration</span>
                  <span className="text-white font-mono">{trace.durationMs}ms</span>
                </div>
                <div className="flex justify-between border-t border-white/10 pt-1">
                  <span className="text-zinc-400">Cost</span>
                  <span className={`font-mono font-bold ${colors.text}`}>{trace.costFormatted}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function TraceViewer({ conversationId }: TraceViewerProps) {
  const [traces, setTraces] = useState<AgentTrace[]>([])
  const [summary, setSummary] = useState<TraceSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadedFor, setLoadedFor] = useState<string | null>(null)

  async function loadTraces() {
    if (!conversationId || loading) return
    setLoading(true)
    try {
      const res = await fetch(`/api/traces/${conversationId}`)
      const data = await res.json()
      setTraces(data.traces ?? [])
      setSummary(data.summary ?? null)
      setLoadedFor(conversationId)
    } finally {
      setLoading(false)
    }
  }

  if (!conversationId) {
    return (
      <Card className="bg-white/5 border-white/10 text-white">
        <CardContent className="pt-6 text-center text-xs text-zinc-600">
          Start a conversation to see agent traces
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="bg-white/5 border-white/10 text-white">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">Agent Trace</CardTitle>
          <button
            onClick={loadTraces}
            disabled={loading}
            className="text-xs text-zinc-400 hover:text-white transition-colors disabled:opacity-50"
          >
            {loading ? 'Loading…' : loadedFor === conversationId ? 'Refresh' : 'Load traces'}
          </button>
        </div>
        {summary && (
          <div className="flex items-center gap-3 text-xs text-zinc-400 mt-1">
            <span>{summary.totalRuns} agent runs</span>
            <span>·</span>
            <span>{summary.totalTokens.toLocaleString()} tokens</span>
            <span>·</span>
            <span className="text-white font-medium font-mono">{summary.totalCostFormatted} total</span>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        {traces.length === 0 && !loading && loadedFor && (
          <p className="text-xs text-zinc-600 text-center py-4">No traces yet for this conversation</p>
        )}
        {traces.map((trace, i) => (
          <TraceCard key={trace.id} trace={trace} index={i} />
        ))}
      </CardContent>
    </Card>
  )
}
