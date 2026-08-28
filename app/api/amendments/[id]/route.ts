import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { draftedHtml } = await request.json()
  if (typeof draftedHtml !== 'string' || !draftedHtml.trim()) {
    return NextResponse.json({ error: 'draftedHtml is required' }, { status: 400 })
  }

  // Only allow edits while the amendment is still awaiting review
  const { data: amendment, error: fetchError } = await supabase
    .from('amendments')
    .select('id, status')
    .eq('id', id)
    .maybeSingle()

  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 })
  if (!amendment) return NextResponse.json({ error: 'Amendment not found' }, { status: 404 })
  if (amendment.status !== 'pending_approval') {
    return NextResponse.json(
      { error: `Amendment is ${amendment.status} and can no longer be edited` },
      { status: 409 }
    )
  }

  const { error: updateError } = await supabase
    .from('amendments')
    .update({ drafted_html: draftedHtml })
    .eq('id', id)

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
