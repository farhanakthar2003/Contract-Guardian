import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { mkdtemp, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import { extractNotificationData } from '@/lib/notifications/extractNotificationData'
import { computeDerivedDates } from '@/lib/notifications/computeDates'

export const maxDuration = 60

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await request.formData()
  const file = formData.get('file') as File
  const title = formData.get('title') as string

  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  const filePath = `${user.id}/${Date.now()}-${file.name}`
  const { error: uploadError } = await supabase.storage
    .from('contracts')
    .upload(filePath, file)

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  const { data: contract, error: insertError } = await supabase
    .from('contracts')
    .insert({
      owner_id: user.id,
      title,
      original_file_url: filePath,
      status: 'active',
    })
    .select()
    .single()

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  // Extract renewal-tracking fields so the Notify page has data immediately.
  // Failure here shouldn't fail the upload — we still write a row with nulls so the
  // Notify page shows a card for every contract.
  let extracted = {
    expiryDate: null as string | null,
    autoRenewal: null as boolean | null,
    renewalPeriod: null as string | null,
    noticePeriod: null as string | null,
  }
  try {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'contract-guardian-upload-'))
    const localPath = path.join(tempDir, 'contract.pdf')
    const buffer = Buffer.from(await file.arrayBuffer())
    await writeFile(localPath, buffer)
    extracted = await extractNotificationData(localPath)
  } catch (err) {
    console.error('Notification extraction failed:', err)
  }

  const { renewalNoticeDate, renewalDate } = computeDerivedDates({
    expiryDate: extracted.expiryDate,
    noticePeriod: extracted.noticePeriod,
  })

  const { error: notifyError } = await supabase.from('contract_notifications').insert({
    contract_id: contract.id,
    owner_id: user.id,
    contract_title: title,
    expiry_date: extracted.expiryDate,
    auto_renewal: extracted.autoRenewal,
    renewal_period: extracted.renewalPeriod,
    notice_period: extracted.noticePeriod,
    renewal_notice_date: renewalNoticeDate,
    renewal_date: renewalDate,
  })

  if (notifyError) {
    console.error('Failed to insert contract_notifications row:', notifyError)
  }

  return NextResponse.json({ contract })
}