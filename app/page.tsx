import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const features = [
  { icon: '🤖', title: 'Agent router', desc: 'A router agent reads each message and dispatches to the best specialist: Researcher, Coder, Analyst, Writer, or Planner.' },
  { icon: '🧠', title: 'Shared agent memory', desc: 'Each agent can see what previous agents did. No repeated work, no lost context across handoffs.' },
  { icon: '🔄', title: 'Built-in RLHF loop', desc: 'Thumbs up/down trains a Thompson sampling bandit to auto-promote whichever agent+prompt combo performs best.' },
  { icon: '📊', title: 'Agent observability', desc: 'Dashboard shows which agents ran, how many tokens each used, and win rates per agent. Know exactly what your system is doing.' },
  { icon: '⚡', title: 'Streaming across agents', desc: 'SSE streaming from any agent. Context window managed per-agent so no single agent blows its limit.' },
  { icon: '💳', title: 'Auth + billing included', desc: 'Clerk auth + Stripe Free/Pro subscriptions pre-wired. Rate limiting per plan. Ship in hours not weeks.' },
]

const stack = ['Next.js 15', 'TypeScript', 'Tailwind CSS', 'shadcn/ui', 'Clerk', 'Supabase', 'Stripe', 'Anthropic Claude', 'Upstash Redis']

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-black text-white">
      {/* Nav */}
      <nav className="border-b border-white/10 px-6 py-4 flex items-center justify-between max-w-6xl mx-auto">
        <span className="font-bold text-lg tracking-tight">AgentKit</span>
        <div className="flex items-center gap-3">
          <a href="https://github.com" className="text-sm text-zinc-400 hover:text-white transition-colors">GitHub</a>
          <Link href="/sign-in">
            <Button variant="outline" size="sm" className="border-white/20 text-white hover:bg-white/10">Sign in</Button>
          </Link>
          <Link href="/sign-up">
            <Button size="sm" className="bg-white text-black hover:bg-zinc-200">Get started</Button>
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-6 pt-24 pb-16 text-center">
        <Badge className="mb-6 bg-white/10 text-white border-white/20 hover:bg-white/10">
          Open source · MIT license
        </Badge>
        <h1 className="text-5xl sm:text-6xl font-bold tracking-tight leading-tight mb-6">
          The multi-agent kit<br />
          <span className="text-zinc-400">that actually ships to prod</span>
        </h1>
        <p className="text-xl text-zinc-400 max-w-2xl mx-auto mb-10">
          Agent routing, shared memory, context management, RLHF feedback loops,
          observability, auth, and billing — all pre-wired in one Next.js boilerplate.
          Stop reinventing multi-agent infrastructure.
        </p>
        <div className="flex items-center justify-center gap-4 flex-wrap">
          <Link href="/sign-up">
            <Button size="lg" className="bg-white text-black hover:bg-zinc-200 text-base px-8">
              Start building free
            </Button>
          </Link>
          <a href="https://github.com" target="_blank" rel="noopener noreferrer">
            <Button size="lg" variant="outline" className="border-white/20 text-white hover:bg-white/10 text-base px-8">
              View on GitHub
            </Button>
          </a>
        </div>
        <p className="mt-4 text-sm text-zinc-500">Free tier available · Pro at $19/month</p>
      </section>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <h2 className="text-2xl font-bold text-center mb-12">Multi-agent infrastructure. Nothing left to figure out.</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map(f => (
            <Card key={f.title} className="bg-white/5 border-white/10 text-white">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <span>{f.icon}</span> {f.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-zinc-400">{f.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Stack */}
      <section className="max-w-4xl mx-auto px-6 py-12 text-center">
        <h2 className="text-lg font-semibold text-zinc-400 mb-6">Built with the best stack</h2>
        <div className="flex flex-wrap justify-center gap-3">
          {stack.map(s => (
            <Badge key={s} className="bg-white/10 text-white border-white/20 hover:bg-white/10 text-sm py-1 px-3">
              {s}
            </Badge>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section className="max-w-4xl mx-auto px-6 py-16">
        <h2 className="text-2xl font-bold text-center mb-12">Simple pricing</h2>
        <div className="grid sm:grid-cols-2 gap-6 max-w-2xl mx-auto">
          <Card className="bg-white/5 border-white/10 text-white">
            <CardHeader>
              <CardTitle>Free</CardTitle>
              <p className="text-3xl font-bold">$0<span className="text-sm font-normal text-zinc-400">/month</span></p>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-zinc-400">
              <p>✓ 10 messages/day</p>
              <p>✓ 10-message memory window</p>
              <p>✓ RLHF feedback loop</p>
              <p>✓ Full source code</p>
              <Link href="/sign-up" className="block mt-4">
                <Button className="w-full bg-white/10 hover:bg-white/20 text-white">Get started</Button>
              </Link>
            </CardContent>
          </Card>
          <Card className="bg-white border-white text-black">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-black">Pro</CardTitle>
                <Badge className="bg-black text-white">Popular</Badge>
              </div>
              <p className="text-3xl font-bold text-black">$19<span className="text-sm font-normal text-zinc-600">/month</span></p>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-zinc-600">
              <p>✓ 200 messages/day</p>
              <p>✓ Full persistent memory</p>
              <p>✓ Auto-summarization</p>
              <p>✓ Advanced bandit analytics</p>
              <p>✓ Priority support</p>
              <Link href="/sign-up" className="block mt-4">
                <Button className="w-full bg-black text-white hover:bg-zinc-800">Upgrade to Pro</Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 py-8 text-center text-sm text-zinc-500">
        <p>AgentKit · Open source · MIT · Built in 48 hours</p>
      </footer>
    </div>
  )
}
