import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowRight, ShieldCheck, FileSignature, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/server'

export default async function Home() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) redirect('/dashboard')

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 left-1/2 h-[36rem] w-[36rem] -translate-x-1/2 rounded-full bg-primary/15 blur-3xl" />
        <div className="absolute bottom-0 left-1/2 h-96 w-[40rem] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
      </div>

      <header className="relative z-10">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center">
            {/* Plain <img> intentionally — Next.js Image was 404-ing on Render for /logo.png */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.png"
              alt="Contract Guardian"
              className="h-10 w-auto"
            />
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}
            >
              Log in
            </Link>
            <Link
              href="/login?mode=signup"
              className={cn(buttonVariants({ size: 'sm' }))}
            >
              Get started
            </Link>
          </div>
        </div>
      </header>

      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 py-8">
        <div className="mx-auto flex max-w-4xl flex-col items-center text-center">
          <h1 className="text-balance text-5xl font-semibold tracking-tight text-foreground sm:text-6xl md:text-7xl">
            It drafts. <span className="text-primary">You decide.</span> It&apos;s signed.
          </h1>

          <p className="mt-6 max-w-2xl text-balance text-lg text-muted-foreground">
            Your agent shouldn&apos;t sign that — so the final word always stays with
            you, backed by Foxit eSign.
          </p>

          <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row">
            <Link
              href="/login?mode=signup"
              className={cn(buttonVariants({ size: 'lg' }), 'min-w-40')}
            >
              Get started
              <ArrowRight className="size-4" />
            </Link>
            <Link
              href="/login"
              className={cn(buttonVariants({ size: 'lg', variant: 'ghost' }), 'min-w-40')}
            >
              I already have an account
            </Link>
          </div>

          <div className="mt-16 inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/60 px-3 py-1 text-xs text-muted-foreground backdrop-blur-sm">
            <Sparkles className="size-3.5 text-primary" />
            Foxit &quot;Your Agent Shouldn&apos;t Sign That&quot; · Hackathon build
          </div>

          <div className="mt-8 grid w-full max-w-3xl grid-cols-1 gap-4 sm:grid-cols-3">
            <FeatureCard
              icon={<Sparkles className="size-4 text-primary" />}
              title="Understands your contract"
              body="Extracts every material clause with section numbers, dates, and defined terms."
            />
            <FeatureCard
              icon={<ShieldCheck className="size-4 text-primary" />}
              title="Human at the gate"
              body="A code-level pause means no signature can ever fire without your explicit approval."
            />
            <FeatureCard
              icon={<FileSignature className="size-4 text-primary" />}
              title="Direct Foxit eSign"
              body="Once approved, the PDF is generated fresh and dispatched via Foxit eSign — never twice."
            />
          </div>
        </div>
      </main>

      <footer className="relative z-10 border-t border-border/60 bg-background/50 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6 text-xs text-muted-foreground">
          <span>Contract Guardian · Protect · Track · Manage</span>
          <span>Built for the Foxit Software hackathon</span>
        </div>
      </footer>
    </div>
  )
}

function FeatureCard({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode
  title: string
  body: string
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/60 p-5 text-left backdrop-blur-sm transition hover:border-border">
      <div className="mb-3 inline-flex size-8 items-center justify-center rounded-lg bg-primary/10">
        {icon}
      </div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{body}</p>
    </div>
  )
}
