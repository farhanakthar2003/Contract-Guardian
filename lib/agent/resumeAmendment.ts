import { createClient } from '@/lib/supabase/server'
import { getContractGuardianGraph } from './graph'
import { Command } from '@langchain/langgraph'
import { computeUpdatedNotificationValues } from '@/lib/notifications/updateFromAmendment'
import { computeDerivedDates } from '@/lib/notifications/computeDates'

export async function resumeAmendment({
  amendmentId,
  decision,
}: {
  amendmentId: string
  decision: 'approved' | 'rejected'
}) {
  const supabase = await createClient()

  // Load the amendment first so we can (a) surface a clear error if it's not visible
  // to this user, and (b) find its contract_id — agent_runs has no contract_id column.
  const { data: amendment, error: amendmentError } = await supabase
    .from('amendments')
    .select('id, contract_id')
    .eq('id', amendmentId)
    .maybeSingle()

  if (amendmentError) {
    throw new Error(`Failed to load amendment: ${amendmentError.message}`)
  }
  if (!amendment) {
    throw new Error(
      `Amendment ${amendmentId} not found. Check that it exists and RLS allows this user to see it.`
    )
  }

  const { data: run, error: runError } = await supabase
    .from('agent_runs')
    .select('*')
    .eq('amendment_id', amendmentId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (runError) {
    throw new Error(`Failed to load agent run: ${runError.message}`)
  }
  if (!run) {
    throw new Error(
      `No agent_runs row found for amendment ${amendmentId}. ` +
        `Most common causes: (1) RLS policies on the agent_runs table are missing — ` +
        `verify the "Users manage their own agent runs" policy from your Supabase setup ` +
        `is applied; (2) this amendment was created before agent_runs was being persisted.`
    )
  }

  const config = { configurable: { thread_id: run.thread_id } }
  const graph = await getContractGuardianGraph()
  const result = await graph.invoke(new Command({ resume: decision }), config)

  await supabase
    .from('amendments')
    .update({
      status: decision === 'approved' ? 'sent_for_signature' : 'rejected',
      drafted_file_url: result.draftedDocumentId ?? undefined,
    })
    .eq('id', amendmentId)

  await supabase
    .from('contracts')
    .update({ status: decision === 'approved' ? 'pending_signature' : 'active' })
    .eq('id', amendment.contract_id)

  await supabase.from('agent_runs').update({ status: 'completed' }).eq('thread_id', run.thread_id)

  if (result.signatureFolderId) {
    const { data: existingRequest } = await supabase
      .from('signature_requests')
      .select('id')
      .eq('amendment_id', amendmentId)
      .maybeSingle()

    if (!existingRequest) {
      await supabase.from('signature_requests').insert({
        amendment_id: amendmentId,
        foxit_esign_folder_id: result.signatureFolderId,
        status: 'sent',
        sent_at: new Date().toISOString(),
      })
    }
  }

  if (decision === 'approved') {
    await syncNotificationRow({
      supabase,
      contractId: amendment.contract_id,
      amendmentId,
    })
  }

  return result
}

// Recomputes contract_notifications from the approved amendment's HTML and updates the
// row. Any failure is logged but does not block the approval flow.
async function syncNotificationRow({
  supabase,
  contractId,
  amendmentId,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>
  contractId: string
  amendmentId: string
}) {
  try {
    const { data: current } = await supabase
      .from('contract_notifications')
      .select('expiry_date, auto_renewal, renewal_period, notice_period')
      .eq('contract_id', contractId)
      .maybeSingle()

    const { data: amendmentRow } = await supabase
      .from('amendments')
      .select('drafted_html')
      .eq('id', amendmentId)
      .maybeSingle()

    if (!amendmentRow?.drafted_html) return

    const updated = await computeUpdatedNotificationValues({
      current: {
        expiryDate: current?.expiry_date ?? null,
        autoRenewal: current?.auto_renewal ?? null,
        renewalPeriod: current?.renewal_period ?? null,
        noticePeriod: current?.notice_period ?? null,
      },
      amendmentHtml: amendmentRow.drafted_html,
    })

    const { renewalNoticeDate, renewalDate } = computeDerivedDates({
      expiryDate: updated.expiryDate,
      noticePeriod: updated.noticePeriod,
    })

    await supabase
      .from('contract_notifications')
      .update({
        expiry_date: updated.expiryDate,
        auto_renewal: updated.autoRenewal,
        renewal_period: updated.renewalPeriod,
        notice_period: updated.noticePeriod,
        renewal_notice_date: renewalNoticeDate,
        renewal_date: renewalDate,
        updated_at: new Date().toISOString(),
      })
      .eq('contract_id', contractId)
  } catch (err) {
    console.error('Failed to sync contract_notifications after approval:', err)
  }
}
