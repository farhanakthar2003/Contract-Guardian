import { createClient } from '@/lib/supabase/server'
import { AppHeader } from '@/components/app-header'
import { Badge } from '@/components/ui/badge'
import ContractDetail from './ContractDetail'

export default async function ContractPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: user }, { data: contract }, { data: amendments }] = await Promise.all([
    supabase.auth.getUser().then((r) => ({ data: r.data.user })),
    supabase.from('contracts').select('id, title, status').eq('id', id).single(),
    supabase
      .from('amendments')
      .select('id, requested_change, status, created_at')
      .eq('contract_id', id)
      .order('created_at', { ascending: false }),
  ])

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <AppHeader
        email={user?.email ?? null}
        backHref="/dashboard"
        backLabel="Dashboard"
      />

      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
        <div className="mb-8">
          <Badge variant="outline" className="mb-3">
            Contract
          </Badge>
          <h1 className="text-3xl font-semibold tracking-tight">
            {contract?.title ?? 'Untitled contract'}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Review past amendments or draft a new one from a plain-language change request.
          </p>
        </div>

        <ContractDetail contractId={id} amendments={amendments ?? []} />
      </main>
    </div>
  )
}
