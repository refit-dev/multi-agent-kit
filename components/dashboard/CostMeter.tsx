'use client'

import { useEffect, useState } from 'react'
import { formatCost } from '@/lib/cost'

interface CostMeterProps {
  plan: 'free' | 'pro'
}

interface CostData {
  today: {
    costFormatted: string
    costUsd: number
    budgetPercent: number
    budgetFormatted: string
    warning: boolean
    exceeded: boolean
  }
}

export default function CostMeter({ plan }: CostMeterProps) {
  const [data, setData] = useState<CostData | null>(null)
  const [sessionCost, setSessionCost] = useState(0) // live cost this session

  useEffect(() => {
    fetch('/api/cost')
      .then(r => r.json())
      .then(setData)
      .catch(() => {})
  }, [])

  // Listen for cost updates from chat stream events
  useEffect(() => {
    const handler = (e: CustomEvent) => {
      setSessionCost(prev => prev + (e.detail?.costUsd ?? 0))
      // Re-fetch cost summary after each message
      fetch('/api/cost').then(r => r.json()).then(setData).catch(() => {})
    }
    window.addEventListener('agentkit:cost', handler as EventListener)
    return () => window.removeEventListener('agentkit:cost', handler as EventListener)
  }, [])

  if (!data) return null

  const { today } = data
  const barColor = today.exceeded
    ? 'bg-red-500'
    : today.warning
      ? 'bg-yellow-500'
      : 'bg-green-500'

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="text-zinc-500">Daily cost</span>
        <div className="flex items-center gap-1">
          {sessionCost > 0 && (
            <span className="text-zinc-600 font-mono">+{formatCost(sessionCost)} session</span>
          )}
          <span className={`font-mono font-medium ${today.exceeded ? 'text-red-400' : today.warning ? 'text-yellow-400' : 'text-white'}`}>
            {today.costFormatted}
          </span>
          <span className="text-zinc-600">/ {today.budgetFormatted}</span>
        </div>
      </div>
      <div className="w-full bg-white/10 rounded-full h-1.5">
        <div
          className={`${barColor} rounded-full h-1.5 transition-all duration-500`}
          style={{ width: `${today.budgetPercent}%` }}
        />
      </div>
      {today.warning && !today.exceeded && (
        <p className="text-xs text-yellow-400">Approaching daily budget limit</p>
      )}
      {today.exceeded && (
        <p className="text-xs text-red-400">Daily budget exceeded — upgrade for more</p>
      )}
    </div>
  )
}
