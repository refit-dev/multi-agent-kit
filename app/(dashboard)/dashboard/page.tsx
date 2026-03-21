import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getBanditStats } from '@/lib/bandit'
import ChatInterface from '@/components/chat/ChatInterface'
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

  // Get or create user
  let { data: user } = await supabase
    .from('users')
    .select('id, plan, email')
    .eq('clerk_id', userId)
    .single()

  if (!user) {
    redirect('/sign-in')
  }

  const plan = user.plan as 'free' | 'pro'

  // Get today's usage
  const today = new Date().toISOString().split('T')[0]
  const { data: usage } = await supabase
    .from('usage_logs')
    .select('tokens_used')
    .eq('user_id', user.id)
    .eq('date', today)
    .single()

  const tokensToday = usage?.tokens_used ?? 0

  // Get bandit stats
  const banditStats = await getBanditStats()

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      {/* Top bar */}
      <header className="border-b border-white/10 px-6 py-3 flex items-center justify-between">
        <span className="font-bold tracking-tight">AgentKit</span>
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
        <div className="bg-green-900/30 border-b border-green-500/30 text-green-300 px-6 py-2 text-sm text-center">
          Welcome to Pro! Your account has been upgraded.
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-72 border-r border-white/10 flex flex-col p-4 gap-4 overflow-y-auto">
          {/* Usage card */}
          <Card className="bg-white/5 border-white/10 text-white">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Today's usage</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-zinc-400 space-y-1">
              <div className="flex justify-between">
                <span>Tokens used</span>
                <span className="text-white font-medium">{tokensToday.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>Plan</span>
                <span className="text-white font-medium capitalize">{plan}</span>
              </div>
              <div className="flex justify-between">
                <span>Daily limit</span>
                <span className="text-white font-medium">{plan === 'pro' ? '200 msgs' : '10 msgs'}</span>
              </div>
            </CardContent>
          </Card>

          <Separator className="bg-white/10" />

          {/* RLHF Bandit stats */}
          <div>
            <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">
              Prompt Bandit Stats
            </h3>
            <div className="space-y-2">
              {banditStats.map(stat => (
                <div key={stat.name} className="flex items-center justify-between text-xs">
                  <span className="text-zinc-400 capitalize">{stat.name}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-16 bg-white/10 rounded-full h-1">
                      <div
                        className="bg-white rounded-full h-1 transition-all"
                        style={{ width: `${stat.winRate}%` }}
                      />
                    </div>
                    <span className="text-white w-8 text-right">{stat.winRate}%</span>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-zinc-600 mt-2">
              Thumbs up/down trains the bandit to auto-pick the best system prompt.
            </p>
          </div>

          <Separator className="bg-white/10" />

          {/* Plan details */}
          {plan === 'free' && (
            <div className="text-xs text-zinc-500 space-y-1">
              <p className="font-medium text-zinc-400">Free limits:</p>
              <p>• 10 messages/day</p>
              <p>• 10-message memory window</p>
              <p className="pt-1">
                <form action="/api/upgrade" method="POST" className="inline">
                  <button type="submit" className="text-white underline hover:no-underline">
                    Upgrade for unlimited memory + 200 msgs/day →
                  </button>
                </form>
              </p>
            </div>
          )}
        </aside>

        {/* Main chat area */}
        <main className="flex-1 flex flex-col overflow-hidden">
          <ChatInterface plan={plan} />
        </main>
      </div>
    </div>
  )
}
