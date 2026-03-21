import { NextRequest, NextResponse } from 'next/server'
import { Webhook } from 'svix'
import { supabase } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const webhookSecret = process.env.CLERK_WEBHOOK_SECRET!
  const payload = await req.text()
  const headers = {
    'svix-id': req.headers.get('svix-id') ?? '',
    'svix-timestamp': req.headers.get('svix-timestamp') ?? '',
    'svix-signature': req.headers.get('svix-signature') ?? '',
  }

  let event: any
  try {
    const wh = new Webhook(webhookSecret)
    event = wh.verify(payload, headers)
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  if (event.type === 'user.created') {
    const { id, email_addresses } = event.data
    const email = email_addresses?.[0]?.email_address ?? ''
    await supabase.from('users').insert({ clerk_id: id, email, plan: 'free' })
  }

  if (event.type === 'user.deleted') {
    await supabase.from('users').delete().eq('clerk_id', event.data.id)
  }

  return NextResponse.json({ ok: true })
}
