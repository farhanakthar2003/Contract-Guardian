import { Bell, FileText } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { AppHeader } from '@/components/app-header'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'

type NotifyRow = {
  id: string
  contract_id: string
  contract_title: string | null
  expiry_date: string | null
  auto_renewal: boolean | null
  renewal_period: string | null
  notice_period: string | null
  created_at: string
}

function formatDate(iso: string | null): string {
  if (!iso) return 'Not Provided'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function formatBool(v: boolean | null): string {
  if (v === null) return 'Not Provided'
  return v ? 'Yes' : 'No'
}

function formatString(v: string | null): string {
  return v && v.trim() ? v : 'Not Provided'
}

export default async function NotifyPage() {
  const supabase = await createClient()
  const [{ data: user }, { data: rows }] = await Promise.all([
    supabase.auth.getUser().then((r) => ({ data: r.data.user })),
    supabase
      .from('contract_notifications')
      .select(
        'id, contract_id, contract_title, expiry_date, auto_renewal, renewal_period, notice_period, created_at'
      )
      .order('created_at', { ascending: false }),
  ])

  const notifications: NotifyRow[] = rows ?? []

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <AppHeader
        email={user?.email ?? null}
        backHref="/dashboard"
        backLabel="Dashboard"
        showNotify={false}
      />

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
        <div className="mb-8">
          <Badge variant="outline" className="mb-3">
            Renewals overview
          </Badge>
          <h1 className="text-3xl font-semibold tracking-tight">Notify</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Renewal-relevant details extracted from each contract. Values shown as{' '}
            <span className="font-medium text-foreground/80">Not Provided</span> when the
            contract did not state them.
          </p>
        </div>

        {notifications.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                <Bell className="size-6 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium">No contracts yet</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Upload a contract from the dashboard to populate this page.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {notifications.map((n) => (
              <Card key={n.id} className="transition hover:border-border">
                <CardContent className="pt-6">
                  <div className="mb-4 flex items-start gap-3">
                    <div className="flex size-9 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-inset ring-primary/20">
                      <FileText className="size-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Contract Title
                      </p>
                      <p className="mt-0.5 truncate text-sm font-semibold">
                        {formatString(n.contract_title)}
                      </p>
                    </div>
                  </div>

                  <Separator />

                  <dl className="mt-4 space-y-3 text-sm">
                    <Field label="Expiry Date" value={formatDate(n.expiry_date)} />
                    <Field label="Auto Renewal" value={formatBool(n.auto_renewal)} />
                    <Field label="Renewal Period" value={formatString(n.renewal_period)} />
                    <Field label="Notice Period" value={formatString(n.notice_period)} />
                  </dl>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  const missing = value === 'Not Provided'
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd
        className={`text-right text-sm ${
          missing ? 'italic text-muted-foreground' : 'font-medium text-foreground'
        }`}
      >
        {value}
      </dd>
    </div>
  )
}
