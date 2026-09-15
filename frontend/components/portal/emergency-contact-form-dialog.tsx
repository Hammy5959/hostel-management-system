"use client"

import { useState, type SubmitEvent } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import { ApiError, createEmergencyContact, updateEmergencyContact } from "@/lib/api"
import type { EmergencyContact } from "@/lib/types"

/** Create/edit dialog for the resident's own emergency contacts — mirrors
 * components/visitors/visitor-form-dialog.tsx's remount-on-reopen pattern
 * (the form is a separate component keyed by `contact?.id ?? "create"` so
 * every field starts from a plain useState computed once at mount). */
export function EmergencyContactFormDialog({
  open,
  onOpenChange,
  contact,
  residentId,
  onSuccess,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  contact: EmergencyContact | null
  /** Create mode only — required to satisfy EmergencyContactCreateInput. */
  residentId?: string
  onSuccess?: () => void
}) {
  const isEdit = !!contact
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-md">
        <DialogHeader className="shrink-0">
          <DialogTitle>{isEdit ? "Edit Contact" : "Add Emergency Contact"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Update this emergency contact's details." : "Add someone we can reach in case of an emergency."}
          </DialogDescription>
        </DialogHeader>

        {open && (
          <EmergencyContactForm
            key={contact?.id ?? "create"}
            contact={contact}
            residentId={residentId}
            onOpenChange={onOpenChange}
            onSuccess={onSuccess}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function EmergencyContactForm({
  contact,
  residentId,
  onOpenChange,
  onSuccess,
}: {
  contact: EmergencyContact | null
  residentId?: string
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}) {
  const isEdit = !!contact

  const [name, setName] = useState(contact?.name ?? "")
  const [relationship, setRelationship] = useState(contact?.relationship ?? "")
  const [phone, setPhone] = useState(contact?.phone ?? "")
  const [alternatePhone, setAlternatePhone] = useState(contact?.alternate_phone ?? "")
  const [email, setEmail] = useState(contact?.email ?? "")
  const [address, setAddress] = useState(contact?.address ?? "")
  const [isPrimary, setIsPrimary] = useState(contact?.is_primary ?? false)

  const [nameError, setNameError] = useState<string | null>(null)
  const [relationshipError, setRelationshipError] = useState<string | null>(null)
  const [phoneError, setPhoneError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(e: SubmitEvent) {
    e.preventDefault()
    let hasError = false
    if (!name.trim()) {
      setNameError("Name is required")
      hasError = true
    }
    if (!relationship.trim()) {
      setRelationshipError("Relationship is required")
      hasError = true
    }
    if (!phone.trim()) {
      setPhoneError("Phone is required")
      hasError = true
    }
    if (hasError) return

    setNameError(null)
    setRelationshipError(null)
    setPhoneError(null)
    setSubmitting(true)
    try {
      if (isEdit && contact) {
        await updateEmergencyContact(contact.id, {
          name: name.trim(),
          relationship: relationship.trim(),
          phone: phone.trim(),
          alternate_phone: alternatePhone || null,
          email: email || null,
          address: address || null,
          is_primary: isPrimary,
        })
        toast.success("Emergency contact updated.")
      } else {
        await createEmergencyContact({
          resident_id: residentId!,
          name: name.trim(),
          relationship: relationship.trim(),
          phone: phone.trim(),
          alternate_phone: alternatePhone || null,
          email: email || null,
          address: address || null,
          is_primary: isPrimary,
        })
        toast.success("Emergency contact added.")
      }
      onSuccess?.()
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Something went wrong. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <FieldGroup>
          <Field data-invalid={!!nameError}>
            <FieldLabel htmlFor="contact-form-name">
              Name <span className="text-destructive">*</span>
            </FieldLabel>
            <Input
              id="contact-form-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                if (e.target.value.trim()) setNameError(null)
              }}
              placeholder="Full name"
            />
            <FieldError errors={[nameError ? { message: nameError } : undefined]} />
          </Field>

          <Field data-invalid={!!relationshipError}>
            <FieldLabel htmlFor="contact-form-relationship">
              Relationship <span className="text-destructive">*</span>
            </FieldLabel>
            <Input
              id="contact-form-relationship"
              value={relationship}
              onChange={(e) => {
                setRelationship(e.target.value)
                if (e.target.value.trim()) setRelationshipError(null)
              }}
              placeholder="e.g. Parent, Sibling"
            />
            <FieldError errors={[relationshipError ? { message: relationshipError } : undefined]} />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field data-invalid={!!phoneError}>
              <FieldLabel htmlFor="contact-form-phone">
                Phone <span className="text-destructive">*</span>
              </FieldLabel>
              <Input
                id="contact-form-phone"
                type="tel"
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value)
                  if (e.target.value.trim()) setPhoneError(null)
                }}
                placeholder="+1 (555) 000-0000"
              />
              <FieldError errors={[phoneError ? { message: phoneError } : undefined]} />
            </Field>

            <Field>
              <FieldLabel htmlFor="contact-form-alternate-phone">Alternate Phone (Optional)</FieldLabel>
              <Input
                id="contact-form-alternate-phone"
                type="tel"
                value={alternatePhone}
                onChange={(e) => setAlternatePhone(e.target.value)}
              />
            </Field>
          </div>

          <Field>
            <FieldLabel htmlFor="contact-form-email">Email (Optional)</FieldLabel>
            <Input id="contact-form-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>

          <Field>
            <FieldLabel htmlFor="contact-form-address">Address (Optional)</FieldLabel>
            <Input id="contact-form-address" value={address} onChange={(e) => setAddress(e.target.value)} />
          </Field>

          <div className="flex items-center gap-2">
            <Checkbox
              id="contact-form-is-primary"
              checked={isPrimary}
              onCheckedChange={(checked) => setIsPrimary(checked === true)}
            />
            <Label htmlFor="contact-form-is-primary" className="text-sm font-normal">
              Set as primary contact
            </Label>
          </div>
        </FieldGroup>
      </div>

      <DialogFooter className="mt-6 shrink-0 border-t border-outline-variant pt-4">
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving…" : isEdit ? "Save Changes" : "Add Contact"}
        </Button>
      </DialogFooter>
    </form>
  )
}
