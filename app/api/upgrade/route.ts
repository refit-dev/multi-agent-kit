import { auth, currentUser } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { createCheckoutSession, createPortalSession } from '@/lib/stripe'

export async function POST() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const clerkUser = await currentUser()
  const email = clerkUser?.emailAddresses?.[0]?.emailAddress ?? ''

  const { data: user } = await supabase
    .from('users')
    .select('id, plan, stripe_customer_id')
    .eq('clerk_id', userId)
    .single()

  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  if (user.plan === 'pro' && user.stripe_customer_id) {
    const url = await createPortalSession(user.stripe_customer_id)
    return NextResponse.json({ url })
  }

  const url = await createCheckoutSession(user.id, email)
  return NextResponse.json({ url })
}
