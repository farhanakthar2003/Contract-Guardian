'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Bell, LogOut, ChevronLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'
import {
  Avatar,
  AvatarFallback,
} from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Separator } from '@/components/ui/separator'

type Props = {
  email: string | null
  backHref?: string
  backLabel?: string
  showNotify?: boolean
}

export function AppHeader({ email, backHref, backLabel = 'Back', showNotify = true }: Props) {
  const router = useRouter()

  const initials = (email ?? '?')
    .split('@')[0]
    .split(/[._-]+/)
    .map((s) => s[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 2) || '?'

  async function handleLogout() {
    const res = await fetch('/api/auth/logout', { method: 'POST' })
    if (res.ok) {
      toast.success('Signed out')
      router.push('/')
      router.refresh()
    } else {
      toast.error('Failed to log out. Please try again.')
    }
  }

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-6">
        <div className="flex items-center gap-3">
          {backHref && (
            <>
              <Link
                href={backHref}
                className={cn(
                  buttonVariants({ variant: 'ghost', size: 'sm' }),
                  '-ml-3 text-muted-foreground'
                )}
              >
                <ChevronLeft className="size-4" />
                {backLabel}
              </Link>
              <Separator orientation="vertical" className="h-6" />
            </>
          )}
          <Link href="/dashboard" className="flex items-center">
            <Image
              src="/logo.png"
              alt="Contract Guardian"
              width={400}
              height={280}
              className="h-9 w-auto"
              priority
              unoptimized
            />
          </Link>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {showNotify && (
            <Link
              href="/dashboard/notify"
              className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}
            >
              <Bell className="size-4" />
              <span className="hidden sm:inline">Notify</span>
            </Link>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger
              className="inline-flex size-9 items-center justify-center rounded-full transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Account menu"
            >
              <Avatar className="size-8">
                <AvatarFallback className="bg-primary/15 text-xs font-medium text-primary">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuGroup>
                <DropdownMenuLabel className="font-normal">
                  <p className="text-xs text-muted-foreground">Signed in as</p>
                  <p className="truncate text-sm font-medium text-foreground">{email ?? 'Unknown'}</p>
                </DropdownMenuLabel>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
                <LogOut className="size-4" />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  )
}
