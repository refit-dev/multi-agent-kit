import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getBanditStats } from '@/lib/bandit'
import { getAgentStats } from '@/lib/agents'
import { formatCost } from '@/lib/cost'
import ChatInterface from '@/components/chat/ChatInterface'
import TraceViewer from '@/components/dashboard/TraceViewer'
import CostMeter from '@/components/dashboard/CostMeter'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ upgraded?: string }>
}) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const params = await searchParams

  const { data: user } = await supabase
    .from('users')
    .select('id, plan, email')
    .eq('clerk_id', userId)
    .single()

  if (!user) redirect('/sign-in')

  const plan = user.plan as 'free' | 'pro'
  const today = new Date().toISOString().split('T')[0]

  const [banditStats, agentStats, todayCost] = await Promise.all([
    getBanditStats(),
    getAgentStats(user.id),
    supabase
      .from('cost_logs')
      .select('cost_usd, input_tokens, output_tokens')
      .eq('user_id', user.id)
      .eq('date', today)
      .single(),
  ])

  const todaySpentUsd = Number(todayCost.data?.cost_usd ?? 0)
  const totalCostAllTime = agentStats.reduce((sum, a) => sum + a.costUsd, 0)

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      {/* Top bar */}
      <header className="border-b border-white/10 px-6 py-3 flex items-center justify-between shrink-0">
        <span className="font-bold tracking-tight">multi-agent-kit</span>
        <div className="flex items-center gap-3">
          <Badge className={plan === 'pro' ? 'bg-white text-black' : 'bg-white/10 text-white border-white/20'}>
            {plan === 'pro' ? 'Pro' : 'Free'}
          </Badge>
          {plan === 'free' && (
            <form action="/api/upgrade" method="POST">
              <Button size="sm" className="bg-white text-black hover:bg-zinc-200">
                Upgrade to Pro $19/mo
              </Button>
            </form>
          )}
          {plan === 'pro' && (
            <form action="/api/upgrade" method="POST">
              <Button size="sm" variant="outline" className="border-white/20 text-white hover:bg-white/10">
                Manage subscription
              </Button>
            </form>
          )}
        </div>
      </header>

      {params.upgraded === 'true' && (
        <div className="bg-green-900/30 border-b border-green-500/30 text-green-300 px-6 py-2 text-sm text-center shrink-0">
          Welcome to Pro! Your account has been upgraded.
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-80 border-r border-white/10 flex flex-col gap-4 overflow-y-auto p-4 shrink-0">

          {/* Cost Meter */}
          <Card className="bg-white/5 border-white/10 text-white">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Cost tracker</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <CostMeter plan={plan} />
              <Separator className="bg-white/10" />
              <div className="flex justify-between text-xs">
                <span className="text-zinc-500">Today</span>
                <span className="font-mono text-white">{formatCost(todaySpentUsd)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-zinc-500">All time</span>
                <span className="font-mono text-white">{formatCost(totalCostAllTime)}</span>
              </div>
            </CardContent>
          </Card>

          {/* Agent stats */}
          {agentStats.length > 0 && (
            <Card className="bg-white/5 border-white/10 text-white">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Agent usage</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {agentStats.map(a => (
                  <div key={a.agentId} className="text-xs">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-zinc-300">{a.emoji} {a.name}</span>
                      <div className="flex items-center gap-2 text-zinc-500">
                        <span>{a.runs} runs</span>
                        <span className="font-mono text-zinc-400">{formatCost(a.costUsd)}</span>
                      </div>
                    </div>
                    {a.winRate !== null && (
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-white/10 rounded-full h-0.5">
                          <div className="bg-white/40 rounded-full h-0.5" style={{ width: `${a.winRate}%` }} />
                        </div>
                        <span className="text-zinc-600">{a.winRate}% 👍</span>
                      </div>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* RLHF Bandit stats */}
          {banditStats.length > 0 && (
            <Card className="bg-white/5 border-white/10 text-white">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Prompt bandit</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {banditStats.map(stat => (
                  <div key={stat.name} className="flex items-center justify-between text-xs">
                    <span className="text-zinc-400 capitalize">{stat.name}</span>
                    <div className="flex items-center gap-2">
                      <div className="w-12 bg-white/10 rounded-full h-1">
                        <div className="bg-white rounded-full h-1" style={{ width: `${stat.winRate}%` }} />
                      </div>
                      <span className="text-white w-8 text-right">{stat.winRate}%</span>
                    </div>
                  </div>
                ))}
                <p className="text-xs text-zinc-600 pt-1">
                  👍/👎 trains the bandit to promote the best system prompt.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Trace viewer */}
          <TraceViewer conversationId={null} />
        </aside>

        {/* Main chat area */}
        <main className="flex-1 flex flex-col overflow-hidden">
          <ChatInterface plan={plan} />
        </main>
      </div>
    </div>
  )
}
