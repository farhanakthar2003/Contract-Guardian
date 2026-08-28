import { createClient } from '@/lib/supabase/server'
import { startAmendment } from '@/lib/agent/runAgent'
import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { requestedChange, signerName, signerEmail } = await request.json()
if (!requestedChange || !signerName || !signerEmail) {
  return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
}

  try {
    const result = await startAmendment({ contractId: id, requestedChange, signerName, signerEmail, userId: user.id })
    return NextResponse.json(result)
  } catch (err: any) {
    console.error(err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}