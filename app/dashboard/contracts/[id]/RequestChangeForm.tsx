'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Loader2, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

const schema = z.object({
  signerName: z.string().min(2, 'Signer name is required'),
  signerEmail: z.string().email('Enter a valid email address'),
  requestedChange: z.string().min(10, 'Describe the change in a bit more detail'),
})

type Values = z.infer<typeof schema>

export default function RequestChangeForm({ contractId }: { contractId: string }) {
  const [submitting, setSubmitting] = useState(false)
  const router = useRouter()
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { signerName: '', signerEmail: '', requestedChange: '' },
  })

  async function onSubmit(values: Values) {
    setSubmitting(true)
    const res = await fetch(`/api/contracts/${contractId}/amend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    })
    setSubmitting(false)

    if (res.ok) {
      const { amendmentId } = await res.json()
      toast.success('Draft ready — review the diff to approve.')
      router.push(`/dashboard/amendments/${amendmentId}`)
    } else {
      const { error } = await res.json().catch(() => ({ error: 'Failed' }))
      toast.error(`Failed: ${error}`)
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="signerName">Signer name</Label>
          <Input
            id="signerName"
            placeholder="e.g. Sarah Lee"
            {...form.register('signerName')}
          />
          {form.formState.errors.signerName && (
            <p className="text-xs text-destructive">{form.formState.errors.signerName.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="signerEmail">Signer email</Label>
          <Input
            id="signerEmail"
            type="email"
            placeholder="sarah@vendor.com"
            {...form.register('signerEmail')}
          />
          {form.formState.errors.signerEmail && (
            <p className="text-xs text-destructive">{form.formState.errors.signerEmail.message}</p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="requestedChange">Describe the change</Label>
        <Textarea
          id="requestedChange"
          rows={4}
          placeholder='e.g. "Renew at $8000 instead of $10000, and extend through Dec 31, 2027."'
          {...form.register('requestedChange')}
        />
        {form.formState.errors.requestedChange && (
          <p className="text-xs text-destructive">
            {form.formState.errors.requestedChange.message}
          </p>
        )}
      </div>

      <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
        Analysis can take up to a minute — you&apos;ll be redirected to the review page
        automatically.
      </div>

      <Button type="submit" disabled={submitting}>
        {submitting ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Analyzing…
          </>
        ) : (
          <>
            <Send className="size-4" />
            Start review
          </>
        )}
      </Button>
    </form>
  )
}
