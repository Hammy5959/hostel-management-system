"use client"

import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"

import { markPermissionDenied } from "@/lib/permissions"
import { ApiError, createResidentDocument } from "@/lib/api"

const documentSchema = z.object({
  document_type: z.string().min(1, "Document type is required").max(100),
  document_number: z.string().max(100).optional().or(z.literal("")),
  file_url: z.string().min(1, "File URL is required"),
})

type DocumentFormValues = z.infer<typeof documentSchema>

const DEFAULT_VALUES: DocumentFormValues = {
  document_type: "",
  document_number: "",
  file_url: "",
}

/** Records a document reference for a resident — there is no file-storage
 * backend yet, so this stores a URL (matching `DocumentCreate.file_url` on
 * the backend), not an actual file upload. */
export function DocumentUploadDialog({
  open,
  onOpenChange,
  residentId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  residentId: string
}) {
  const queryClient = useQueryClient()

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<DocumentFormValues>({
    resolver: zodResolver(documentSchema),
    defaultValues: DEFAULT_VALUES,
  })

  async function onSubmit(values: DocumentFormValues) {
    try {
      await createResidentDocument({
        resident_id: residentId,
        document_type: values.document_type,
        document_number: values.document_number || null,
        file_url: values.file_url,
      })
      toast.success("Document uploaded.")
      queryClient.invalidateQueries({ queryKey: ["resident-documents", residentId] })
      onOpenChange(false)
      reset(DEFAULT_VALUES)
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "missing_permission") {
          markPermissionDenied("resident_documents.manage")
        }
        toast.error(err.message)
      } else {
        toast.error("Something went wrong. Please try again.")
      }
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) reset(DEFAULT_VALUES)
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Upload Document</DialogTitle>
          <DialogDescription>Add a document record for this resident.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <FieldGroup>
            <Field data-invalid={!!errors.document_type}>
              <FieldLabel htmlFor="document-type">
                Document Type <span className="text-destructive">*</span>
              </FieldLabel>
              <Input
                id="document-type"
                placeholder="e.g., National ID, Passport"
                {...register("document_type")}
                aria-invalid={!!errors.document_type}
              />
              <FieldError errors={[errors.document_type]} />
            </Field>

            <Field data-invalid={!!errors.document_number}>
              <FieldLabel htmlFor="document-number">Document Number</FieldLabel>
              <Input
                id="document-number"
                {...register("document_number")}
                aria-invalid={!!errors.document_number}
              />
              <FieldError errors={[errors.document_number]} />
            </Field>

            <Field data-invalid={!!errors.file_url}>
              <FieldLabel htmlFor="document-file-url">
                File URL <span className="text-destructive">*</span>
              </FieldLabel>
              <Input
                id="document-file-url"
                placeholder="https://…"
                {...register("file_url")}
                aria-invalid={!!errors.file_url}
              />
              <FieldError errors={[errors.file_url]} />
            </Field>
          </FieldGroup>

          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Uploading…" : "Upload"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
