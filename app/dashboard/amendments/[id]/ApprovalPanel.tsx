'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  ArrowDown,
  Check,
  ChevronDown,
  Loader2,
  Pencil,
  Send,
  X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

type Amendment = {
  id: string
  status: string
  diff_summary: { clause: string; before: string; after: string }[] | null
  drafted_html: string | null
}

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

export default function ApprovalPanel({ amendment }: { amendment: Amendment }) {
  const [loading, setLoading] = useState<'approved' | 'rejected' | null>(null)
  const [showFull, setShowFull] = useState(false)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const editorRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  useEffect(() => {
    if (editing && editorRef.current) {
      editorRef.current.innerHTML = amendment.drafted_html ?? ''
    }
  }, [editing, amendment.drafted_html])

  async function decide(decision: 'approved' | 'rejected') {
    setLoading(decision)
    const res = await fetch(`/api/amendments/${amendment.id}/decision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision }),
    })
    setLoading(null)
    if (res.ok) {
      toast.success(decision === 'approved' ? 'Approved — dispatching to eSign.' : 'Rejected.')
      router.refresh()
    } else {
      const { error } = await res.json().catch(() => ({ error: 'Failed' }))
      toast.error(`Failed: ${error}`)
    }
  }

  async function saveEdits() {
    const html = editorRef.current?.innerHTML?.trim() ?? ''
    if (!html) {
      toast.error('Amendment cannot be empty.')
      return
    }
    setSaving(true)
    const res = await fetch(`/api/amendments/${amendment.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ draftedHtml: html }),
    })
    setSaving(false)
    if (res.ok) {
      toast.success('Amendment updated.')
      setEditing(false)
      router.refresh()
    } else {
      const { error } = await res.json().catch(() => ({ error: 'Failed' }))
      toast.error(`Failed to save: ${error}`)
    }
  }

  if (amendment.status !== 'pending_approval') {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 py-6">
          <Badge variant={statusVariant(amendment.status)}>{statusLabel(amendment.status)}</Badge>
          <p className="text-sm text-muted-foreground">
            This amendment is no longer awaiting a decision.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Diff summary</CardTitle>
          <CardDescription>Review each clause change before approving.</CardDescription>
        </CardHeader>
        <CardContent>
          {amendment.diff_summary && amendment.diff_summary.length > 0 ? (
            <ul className="space-y-4">
              {amendment.diff_summary.map((d, i) => (
                <li
                  key={i}
                  className="overflow-hidden rounded-lg border border-border/60 bg-card/40"
                >
                  <div className="border-b border-border/60 bg-muted/30 px-4 py-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Clause
                    </p>
                    <p className="mt-0.5 text-sm font-semibold">{d.clause}</p>
                  </div>
                  <div className="divide-y divide-border/60">
                    <div className="px-4 py-3">
                      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-destructive/80">
                        Before
                      </p>
                      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-destructive line-through decoration-destructive/40">
                        {d.before}
                      </p>
                    </div>
                    <div className="flex items-center justify-center py-1">
                      <ArrowDown className="size-4 text-muted-foreground" />
                    </div>
                    <div className="px-4 py-3">
                      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-500/90">
                        After
                      </p>
                      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-emerald-400">
                        {d.after}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No changes detected.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <button
          type="button"
          onClick={() => setShowFull((v) => !v)}
          className="flex w-full items-center justify-between gap-3 px-6 py-4 text-left transition hover:bg-muted/30"
          aria-expanded={showFull}
        >
          <div>
            <p className="text-sm font-medium">View full amendment</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Preview the complete document, and edit it if needed before approving.
            </p>
          </div>
          <ChevronDown
            className={`size-4 text-muted-foreground transition-transform ${showFull ? 'rotate-180' : ''}`}
          />
        </button>

        {showFull && (
          <div className="space-y-3 border-t border-border/60 p-4">
            {amendment.drafted_html ? (
              editing ? (
                <>
                  <div className="rounded-lg border border-border bg-white p-2">
                    <div
                      ref={editorRef}
                      contentEditable
                      suppressContentEditableWarning
                      spellCheck
                      className="min-h-96 max-h-[70vh] overflow-y-auto rounded p-2 text-zinc-900 outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Click anywhere to edit. Ctrl/Cmd+B and Ctrl/Cmd+I work like a normal editor.
                    The PDF sent for signature is generated from this content the moment you
                    click Approve.
                  </p>
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setEditing(false)}
                      disabled={saving}
                    >
                      Cancel
                    </Button>
                    <Button onClick={saveEdits} disabled={saving}>
                      {saving ? (
                        <>
                          <Loader2 className="size-4 animate-spin" />
                          Saving…
                        </>
                      ) : (
                        'Save edits'
                      )}
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <iframe
                    srcDoc={amendment.drafted_html}
                    sandbox=""
                    title="Amendment preview"
                    className="h-96 w-full rounded-lg border border-border bg-white"
                  />
                  <div className="flex justify-end">
                    <Button variant="outline" onClick={() => setEditing(true)}>
                      <Pencil className="size-4" />
                      Edit amendment
                    </Button>
                  </div>
                </>
              )
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No amendment preview available.
              </p>
            )}
          </div>
        )}
      </Card>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button
          variant="outline"
          onClick={() => decide('rejected')}
          disabled={!!loading}
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          {loading === 'rejected' ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Rejecting…
            </>
          ) : (
            <>
              <X className="size-4" />
              Reject
            </>
          )}
        </Button>

        <Button
          onClick={() => decide('approved')}
          disabled={!!loading}
          className="bg-emerald-600 text-white hover:bg-emerald-600/90"
        >
          {loading === 'approved' ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Approving…
            </>
          ) : (
            <>
              <Check className="size-4" />
              Approve &amp; send
              <Send className="size-4" />
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
