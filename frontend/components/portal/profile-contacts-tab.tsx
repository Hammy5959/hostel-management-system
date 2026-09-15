"use client"

import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { HeartPulse, Pencil, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/hostel/empty-state"
import { ErrorState } from "@/components/hostel/error-state"
import { StatusBadge } from "@/components/hostel/status-badge"
import { ConfirmDialog } from "@/components/hostel/confirm-dialog"
import { EmergencyContactFormDialog } from "@/components/portal/emergency-contact-form-dialog"

import { useMyResident } from "@/components/portal/resident-provider"
import { ApiError, deleteEmergencyContact, getEmergencyContacts } from "@/lib/api"
import type { EmergencyContact } from "@/lib/types"

function ContactCard({
  contact,
  onEdit,
  onDelete,
}: {
  contact: EmergencyContact
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <div className="flex flex-col rounded-xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="truncate text-sm font-semibold text-on-surface">{contact.name}</h4>
          <p className="mt-0.5 truncate text-xs text-on-surface-variant">{contact.relationship}</p>
        </div>
        {contact.is_primary && <StatusBadge status="primary" tone="violet" label="Primary" />}
      </div>

      <div className="mb-4 space-y-1 text-sm text-on-surface-variant">
        <p>{contact.phone}</p>
        {contact.alternate_phone && <p>{contact.alternate_phone}</p>}
        {contact.email && <p className="truncate">{contact.email}</p>}
      </div>

      <div className="mt-auto flex items-center gap-1 border-t border-outline-variant pt-3">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Edit ${contact.name}`}
          onClick={onEdit}
          className="rounded-full text-on-surface-variant hover:bg-surface-container-low hover:text-primary"
        >
          <Pencil aria-hidden className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Delete ${contact.name}`}
          onClick={onDelete}
          className="rounded-full text-on-surface-variant hover:bg-error-container hover:text-on-error-container"
        >
          <Trash2 aria-hidden className="size-4" />
        </Button>
      </div>
    </div>
  )
}

export function ProfileContactsTab() {
  const { resident } = useMyResident()
  const queryClient = useQueryClient()

  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<EmergencyContact | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<EmergencyContact | null>(null)
  const [deleting, setDeleting] = useState(false)

  const query = useQuery({ queryKey: ["my-emergency-contacts"], queryFn: () => getEmergencyContacts({}) })

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["my-emergency-contacts"] })
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteEmergencyContact(deleteTarget.id)
      toast.success(`${deleteTarget.name} was removed from your emergency contacts.`)
      invalidate()
      setDeleteTarget(null)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Something went wrong. Please try again.")
    } finally {
      setDeleting(false)
    }
  }

  const contacts = query.data?.items ?? []

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-on-surface-variant">People we can reach in case of an emergency.</p>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          Add Contact
        </Button>
      </div>

      {query.isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full rounded-xl" />
          ))}
        </div>
      ) : query.isError ? (
        <ErrorState message={(query.error as Error).message} onRetry={() => query.refetch()} />
      ) : contacts.length === 0 ? (
        <EmptyState
          icon={HeartPulse}
          title="No emergency contacts yet"
          description="Add someone we can reach in case of an emergency."
          action={{ label: "Add Contact", onClick: () => setCreateOpen(true) }}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {contacts.map((contact) => (
            <ContactCard
              key={contact.id}
              contact={contact}
              onEdit={() => setEditTarget(contact)}
              onDelete={() => setDeleteTarget(contact)}
            />
          ))}
        </div>
      )}

      <EmergencyContactFormDialog
        open={createOpen || !!editTarget}
        onOpenChange={(open) => {
          if (!open) {
            setCreateOpen(false)
            setEditTarget(null)
          }
        }}
        contact={editTarget}
        residentId={resident?.id}
        onSuccess={invalidate}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete this contact?"
        description={`Remove ${deleteTarget?.name ?? "this contact"} from your emergency contacts? This cannot be undone.`}
        confirmLabel="Delete Contact"
        destructive
        loading={deleting}
        onConfirm={handleDeleteConfirm}
      />
    </div>
  )
}
