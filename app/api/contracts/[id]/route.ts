import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: contract, error: fetchError } = await supabase
    .from('contracts')
    .select('id, original_file_url')
    .eq('id', id)
    .maybeSingle()

  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 })
  if (!contract) return NextResponse.json({ error: 'Contract not found' }, { status: 404 })

  // Manual cascade — FKs on amendments/agent_runs/signature_requests are not ON DELETE CASCADE
  const { data: amendments, error: amendmentsError } = await supabase
    .from('amendments')
    .select('id')
    .eq('contract_id', id)

  if (amendmentsError) return NextResponse.json({ error: amendmentsError.message }, { status: 500 })

  const amendmentIds = (amendments ?? []).map((a) => a.id)
  if (amendmentIds.length > 0) {
    const sigDel = await supabase
      .from('signature_requests')
      .delete()
      .in('amendment_id', amendmentIds)
    if (sigDel.error) return NextResponse.json({ error: sigDel.error.message }, { status: 500 })

    const runDel = await supabase
      .from('agent_runs')
      .delete()
      .in('amendment_id', amendmentIds)
    if (runDel.error) return NextResponse.json({ error: runDel.error.message }, { status: 500 })

    const amendDel = await supabase.from('amendments').delete().eq('contract_id', id)
    if (amendDel.error) return NextResponse.json({ error: amendDel.error.message }, { status: 500 })
  }

  if (contract.original_file_url) {
    // Storage failure shouldn't block deleting the row — log and continue
    const { error: storageError } = await supabase.storage
      .from('contracts')
      .remove([contract.original_file_url])
    if (storageError) console.error('Failed to remove contract file from storage:', storageError)
  }

  const { error: deleteError } = await supabase.from('contracts').delete().eq('id', id)
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
