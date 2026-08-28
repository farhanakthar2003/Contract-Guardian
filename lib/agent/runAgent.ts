import { createClient } from '@/lib/supabase/server'
import { getContractGuardianGraph } from './graph'
import { mkdtemp, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import { randomUUID } from 'crypto'

export async function startAmendment({
  contractId,
  requestedChange,
  signerName,
  signerEmail,  
  userId,
}: {
  contractId: string
  requestedChange: string
  signerName: string
  signerEmail: string
  userId: string
}) {
  const supabase = await createClient()

  const { data: contract, error: contractError } = await supabase
    .from('contracts')
    .select('*')
    .eq('id', contractId)
    .single()
  if (contractError || !contract) throw new Error('Contract not found')

  const { data: fileBlob, error: downloadError } = await supabase.storage
    .from('contracts')
    .download(contract.original_file_url)
  if (downloadError || !fileBlob) throw new Error('Could not download contract file')

  const tempDir = await mkdtemp(path.join(tmpdir(), 'contract-guardian-run-'))
  const localPath = path.join(tempDir, 'contract.pdf')
  const buffer = Buffer.from(await fileBlob.arrayBuffer())
  await writeFile(localPath, buffer)

  const threadId = randomUUID()

  // Count prior amendments on this contract so the drafted amendment can be numbered
  // (e.g. "Amendment No. 3"). Read before we insert the new row.
  const { count: priorAmendmentCount } = await supabase
    .from('amendments')
    .select('*', { count: 'exact', head: true })
    .eq('contract_id', contractId)
  const amendmentSequenceNumber = (priorAmendmentCount ?? 0) + 1

  const { data: amendment, error: amendmentError } = await supabase
    .from('amendments')
    .insert({
      contract_id: contractId,
      owner_id: userId,
      requested_change: requestedChange,
      status: 'drafted',
    })
    .select()
    .single()
  if (amendmentError || !amendment) throw new Error('Could not create amendment row')

   const { error: runInsertError } = await supabase.from('agent_runs').insert({
    amendment_id: amendment.id,
    thread_id: threadId,
    status: 'running',
  })
  if (runInsertError) throw new Error(`Could not create agent run: ${runInsertError.message}`)

  const config = { configurable: { thread_id: threadId } }
  const graph = await getContractGuardianGraph()

  let result
  try {
    result = await graph.invoke(
      { contractId, contractFilePath: localPath, requestedChange, signerName, signerEmail, amendmentId: amendment.id, amendmentSequenceNumber },
      config
    )
  } catch (err) {
    await supabase
      .from('agent_runs')
      .update({ status: 'failed' })
      .eq('thread_id', threadId)
    throw err
  }

  await supabase
    .from('amendments')
    .update({
      diff_summary: result.diffSummary,
      drafted_html: result.draftedText ?? null,
      status: 'pending_approval',
    })
    .eq('id', amendment.id)

    await supabase
  .from('contracts')
  .update({ status: 'amendment_pending' })
  .eq('id', contractId)

  await supabase
    .from('agent_runs')
    .update({ status: 'paused_for_approval' })
    .eq('thread_id', threadId)

  return { amendmentId: amendment.id, diffSummary: result.diffSummary }
}