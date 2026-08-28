'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { CloudUpload, Loader2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const uploadSchema = z.object({
  title: z.string().min(2, 'Give the contract a name'),
})
type UploadValues = z.infer<typeof uploadSchema>

const MAX_MB = 20

export function UploadContractCard() {
  const [file, setFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const router = useRouter()

  const form = useForm<UploadValues>({
    resolver: zodResolver(uploadSchema),
    defaultValues: { title: '' },
  })

  function acceptFile(f: File | null | undefined) {
    if (!f) return
    if (f.type && f.type !== 'application/pdf' && !f.name.toLowerCase().endsWith('.pdf')) {
      toast.error('Only PDF files are supported.')
      return
    }
    if (f.size > MAX_MB * 1024 * 1024) {
      toast.error(`File is larger than ${MAX_MB} MB.`)
      return
    }
    setFile(f)
  }

  async function onSubmit(values: UploadValues) {
    if (!file) {
      toast.error('Choose a PDF to upload.')
      return
    }
    setUploading(true)

    const formData = new FormData()
    formData.append('file', file)
    formData.append('title', values.title)

    const res = await fetch('/api/contracts/upload', { method: 'POST', body: formData })
    setUploading(false)

    if (res.ok) {
      toast.success('Contract uploaded — analyzing renewal terms in the background.')
      form.reset()
      setFile(null)
      router.refresh()
    } else {
      const { error } = await res.json().catch(() => ({ error: 'Upload failed' }))
      toast.error(`Upload failed: ${error}`)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Upload a new contract</CardTitle>
        <CardDescription>
          PDF only. Renewal-relevant details are extracted automatically after upload.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Contract title</Label>
            <Input
              id="title"
              placeholder="e.g. ABC Vendor Agreement"
              {...form.register('title')}
            />
            {form.formState.errors.title && (
              <p className="text-xs text-destructive">{form.formState.errors.title.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Contract PDF</Label>
            <label
              onDragOver={(e) => {
                e.preventDefault()
                setIsDragging(true)
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault()
                setIsDragging(false)
                acceptFile(e.dataTransfer.files?.[0])
              }}
              className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-8 text-center transition ${
                isDragging
                  ? 'border-primary/60 bg-primary/5'
                  : 'border-border bg-muted/20 hover:border-border/80 hover:bg-muted/40'
              }`}
            >
              <CloudUpload className="size-8 text-muted-foreground" />
              {file ? (
                <div className="text-sm">
                  <p className="font-medium text-foreground">{file.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {(file.size / 1024).toFixed(1)} KB · click to replace
                  </p>
                </div>
              ) : (
                <div className="text-sm">
                  <p className="font-medium text-foreground/80">
                    Drop a PDF here, or <span className="text-primary">browse</span>
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">PDF only, up to {MAX_MB} MB</p>
                </div>
              )}
              <input
                type="file"
                accept="application/pdf"
                onChange={(e) => acceptFile(e.target.files?.[0])}
                className="hidden"
              />
            </label>
          </div>

          <Button type="submit" disabled={uploading || !file} className="w-full sm:w-auto">
            {uploading ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Uploading…
              </>
            ) : (
              <>
                <Plus className="size-4" />
                Upload contract
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
