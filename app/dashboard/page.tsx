import Link from 'next/link'
import { FileText, ChevronRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { AppHeader } from '@/components/app-header'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { UploadContractCard } from './UploadContractCard'

type Contract = {
  id: string
  title: string
  status: string
  created_at: string
}

const STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  amendment_pending: 'Amendment pending',
  pending_signature: 'Pending signature',
  expiring_soon: 'Expiring soon',
  expired: 'Expired',
  archived: 'Archived',
}

function statusVariant(
  status: string
): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'active':
      return 'default'
    case 'amendment_pending':
    case 'pending_signature':
    case 'expiring_soon':
      return 'secondary'
    case 'expired':
      return 'destructive'
    default:
      return 'outline'
  }
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return ''
  }
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: contracts } = await supabase
    .from('contracts')
    .select('id, title, status, created_at')
    .order('created_at', { ascending: false })

  const list: Contract[] = contracts ?? []

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <AppHeader email={user?.email ?? null} showNotify />

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
        <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Your contracts</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Upload a PDF to start tracking and amending your agreements.
            </p>
          </div>
          <Badge variant="outline" className="gap-1.5">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            {list.length} total
          </Badge>
        </div>

        <div className="mb-10">
          <UploadContractCard />
        </div>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-medium text-muted-foreground">Recent contracts</h2>
          </div>

          {list.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center gap-3 py-14 text-center">
                <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                  <FileText className="size-6 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium">No contracts yet</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Upload your first contract to get started.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <ul className="space-y-2">
              {list.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/dashboard/contracts/${c.id}`}
                    className="group flex items-center justify-between gap-4 rounded-xl border border-border/60 bg-card/60 p-4 backdrop-blur-sm transition hover:border-border hover:bg-card"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex size-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-inset ring-primary/20">
                        <FileText className="size-5 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{c.title}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Added {formatDate(c.created_at)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant={statusVariant(c.status)}>
                        {STATUS_LABELS[c.status] ?? c.status}
                      </Badge>
                      <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  )
}
