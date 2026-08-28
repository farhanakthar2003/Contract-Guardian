import Link from 'next/link'
import { AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/server'
import { AppHeader } from '@/components/app-header'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import ApprovalPanel from './ApprovalPanel'

export default async function AmendmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: user }, { data: amendment }] = await Promise.all([
    supabase.auth.getUser().then((r) => ({ data: r.data.user })),
    supabase.from('amendments').select('*').eq('id', id).single(),
  ])

  if (!amendment) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <AppHeader email={user?.email ?? null} backHref="/dashboard" backLabel="Dashboard" />
        <main className="mx-auto flex w-full max-w-2xl flex-1 items-center justify-center px-6 py-16">
          <Card className="w-full">
            <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                <AlertCircle className="size-6 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-semibold">Amendment not found</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  It may have been deleted or the link is incorrect.
                </p>
              </div>
              <Link
                href="/dashboard"
                className={cn(buttonVariants({ variant: 'outline' }))}
              >
                Back to dashboard
              </Link>
            </CardContent>
          </Card>
        </main>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <AppHeader
        email={user?.email ?? null}
        backHref={`/dashboard/contracts/${amendment.contract_id}`}
        backLabel="Contract"
      />

      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
        <div className="mb-8">
          <Badge variant="outline" className="mb-3">
            Review amendment
          </Badge>
          <h1 className="text-3xl font-semibold tracking-tight">Proposed change</h1>
          <Card className="mt-4">
            <CardContent className="pt-6">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Requested change
              </p>
              <p className="mt-1 text-sm leading-relaxed">{amendment.requested_change}</p>
            </CardContent>
          </Card>
        </div>

        <ApprovalPanel amendment={amendment} />
      </main>
    </div>
  )
}
