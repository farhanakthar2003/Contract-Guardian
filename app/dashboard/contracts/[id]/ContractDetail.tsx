'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  ChevronRight,
  History,
  Loader2,
  Plus,
  Trash2,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import RequestChangeForm from './RequestChangeForm'

type Amendment = {
  id: string
  requested_change: string
  status: string
  created_at: string
}

const DECIDED_STATUSES = new Set(['approved', 'rejected', 'sent_for_signature', 'signed'])
const PENDING_STATUSES = new Set(['pending_approval'])

function statusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'approved':
    case 'signed':
      return 'default'
    case 'rejected':
      return 'destructive'
    case 'sent_for_signature':
    case 'pending_approval':
      return 'secondary'
    default:
      return 'outline'
  }
}

function statusLabel(status: string): string {
  return (
    (
      {
        approved: 'Approved',
        rejected: 'Rejected',
        pending_approval: 'Pending approval',
        sent_for_signature: 'Sent for signature',
        signed: 'Signed',
        drafted: 'Drafted',
      } as Record<string, string>
    )[status] ?? status
  )
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

function byNewest(a: Amendment, b: Amendment) {
  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
}

type View = 'none' | 'new' | 'old'
type OldTab = 'decided' | 'pending'

export default function ContractDetail({
  contractId,
  amendments,
}: {
  contractId: string
  amendments: Amendment[]
}) {
  const decided = amendments.filter((a) => DECIDED_STATUSES.has(a.status)).sort(byNewest)
  const pending = amendments.filter((a) => PENDING_STATUSES.has(a.status)).sort(byNewest)
  const hasAnyAmendment = decided.length + pending.length > 0

  const [view, setView] = useState<View>('none')
  const [oldTab, setOldTab] = useState<OldTab>('decided')
  const [deleting, setDeleting] = useState(false)
  const router = useRouter()

  async function handleDelete() {
    setDeleting(true)
    const res = await fetch(`/api/contracts/${contractId}`, { method: 'DELETE' })
    if (res.ok) {
      toast.success('Contract deleted')
      router.push('/dashboard')
      router.refresh()
    } else {
      setDeleting(false)
      const { error } = await res.json().catch(() => ({ error: 'Failed' }))
      toast.error(`Failed to delete: ${error}`)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        {hasAnyAmendment && (
          <Button
            variant={view === 'old' ? 'secondary' : 'outline'}
            onClick={() => setView(view === 'old' ? 'none' : 'old')}
          >
            <History className="size-4" />
            Old amendments
            <Badge variant="secondary" className="ml-1">
              {decided.length + pending.length}
            </Badge>
          </Button>
        )}

        <Button
          variant={view === 'new' ? 'default' : 'outline'}
          onClick={() => setView(view === 'new' ? 'none' : 'new')}
        >
          <Plus className="size-4" />
          New amendment
        </Button>

        <div className="ml-auto">
          <AlertDialog>
            <AlertDialogTrigger
              className={cn(
                buttonVariants({ variant: 'outline' }),
                'text-destructive hover:bg-destructive/10 hover:text-destructive'
              )}
            >
              <Trash2 className="size-4" />
              Delete contract
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this contract?</AlertDialogTitle>
                <AlertDialogDescription>
                  This permanently removes the contract, its PDF file, and all its amendments
                  and signature history. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  disabled={deleting}
                  className="bg-destructive text-white hover:bg-destructive/90"
                >
                  {deleting ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Deleting…
                    </>
                  ) : (
                    'Yes, delete'
                  )}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {view === 'new' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Request an amendment</CardTitle>
            <CardDescription>
              Describe the change in plain English. The agent extracts terms, drafts the
              amendment, and produces a diff for your approval.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RequestChangeForm contractId={contractId} />
          </CardContent>
        </Card>
      )}

      {view === 'old' && (
        <Card>
          <CardContent className="pt-6">
            <Tabs value={oldTab} onValueChange={(v) => setOldTab(v as OldTab)}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="decided">
                  Approved / Rejected
                  <Badge variant="secondary" className="ml-2">
                    {decided.length}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger value="pending">
                  Pending approval
                  <Badge variant="secondary" className="ml-2">
                    {pending.length}
                  </Badge>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="decided" className="mt-4">
                <AmendmentList
                  items={decided}
                  emptyTitle="No decided amendments yet"
                  emptyBody="Approved or rejected amendments will appear here."
                />
              </TabsContent>
              <TabsContent value="pending" className="mt-4">
                <AmendmentList
                  items={pending}
                  emptyTitle="No amendments awaiting approval"
                  emptyBody="Newly drafted amendments awaiting your review will appear here."
                />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function AmendmentList({
  items,
  emptyTitle,
  emptyBody,
}: {
  items: Amendment[]
  emptyTitle: string
  emptyBody: string
}) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/60 py-10 text-center">
        <p className="text-sm font-medium">{emptyTitle}</p>
        <p className="text-xs text-muted-foreground">{emptyBody}</p>
      </div>
    )
  }

  return (
    <ul className="space-y-2">
      {items.map((a) => (
        <li key={a.id}>
          <Link
            href={`/dashboard/amendments/${a.id}`}
            className="group flex items-start justify-between gap-4 rounded-lg border border-border/60 bg-card/60 p-4 backdrop-blur-sm transition hover:border-border hover:bg-card"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{a.requested_change}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{formatDate(a.created_at)}</p>
            </div>
            <div className="flex flex-shrink-0 items-center gap-2">
              <Badge variant={statusVariant(a.status)}>{statusLabel(a.status)}</Badge>
              <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  )
}
