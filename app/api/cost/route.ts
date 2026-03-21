import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { formatCost, DAILY_BUDGET_USD, budgetStatus } from '@/lib/cost'
import { getAgentStats } from '@/lib/agents'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: user } = await supabase
    .from('users')
    .select('id, plan')
    .eq('clerk_id', userId)
    .single()

  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const plan = user.plan as 'free' | 'pro'
  const today = new Date().toISOString().split('T')[0]

  // Today's cost + last 7 days
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    .toISOString().split('T')[0]

  const [{ data: todayCost }, { data: weekCosts }, agentStats] = await Promise.all([
    supabase
      .from('cost_logs')
      .select('cost_usd, input_tokens, output_tokens')
      .eq('user_id', user.id)
      .eq('date', today)
      .single(),
    supabase
      .from('cost_logs')
      .select('date, cost_usd, input_tokens, output_tokens')
      .eq('user_id', user.id)
      .gte('date', sevenDaysAgo)
      .order('date', { ascending: true }),
    getAgentStats(user.id),
  ])

  const todaySpent = Number(todayCost?.cost_usd ?? 0)
  const budget = budgetStatus(todaySpent, plan)

  return NextResponse.json({
    today: {
      costUsd: todaySpent,
      costFormatted: formatCost(todaySpent),
      inputTokens: todayCost?.input_tokens ?? 0,
      outputTokens: todayCost?.output_tokens ?? 0,
      budgetUsd: DAILY_BUDGET_USD[plan],
      budgetFormatted: formatCost(DAILY_BUDGET_USD[plan]),
      budgetPercent: budget.percent,
      warning: budget.warning,
      exceeded: budget.exceeded,
    },
    week: (weekCosts ?? []).map(d => ({
      date: d.date,
      costUsd: Number(d.cost_usd),
      costFormatted: formatCost(Number(d.cost_usd)),
      inputTokens: d.input_tokens,
      outputTokens: d.output_tokens,
    })),
    byAgent: agentStats,
  })
}
