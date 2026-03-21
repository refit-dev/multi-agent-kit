import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { recordFeedback } from '@/lib/bandit'

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { messageId, feedback } = await req.json()
  if (!messageId || ![1, -1].includes(feedback)) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  await recordFeedback(messageId, feedback as 1 | -1)
  return NextResponse.json({ ok: true })
}
