"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { ArrowLeft, IdCard, KeyRound, Pencil, ShieldOff, UserRound, X } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import { Breadcrumbs } from "@/components/hostel/breadcrumbs"
import { EmptyState } from "@/components/hostel/empty-state"
import { ErrorState } from "@/components/hostel/error-state"
import { StatusBadge } from "@/components/hostel/status-badge"
import { PhotoPicker } from "@/components/residents/photo-picker"
import { RoleBadge, USER_STATUS_TONE, formatLastLogin, initials } from "@/components/users/user-badges"
import { ResetPasswordDialog } from "@/components/users/reset-password-dialog"

import { usePermissions, markPermissionDenied } from "@/lib/permissions"
import { getStoredUser, setStoredUser } from "@/lib/auth"
import { ApiError, getRoles, getUser, setUserStatus, updateMe, updateUser } from "@/lib/api"
import type { User, UserSelfUpdateInput, UserUpdateInput } from "@/lib/types"

function InfoRow({
  label,
  value,
  className,
}: {
  label: string
  value: React.ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <dt className="mb-1 text-xs font-semibold tracking-wider text-on-surface-variant uppercase">{label}</dt>
      <dd className="text-sm text-on-surface">{value || "—"}</dd>
    </div>
  )
}

function formatDate(value: string | null): string {
  if (!value) return "—"
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

const editSchema = z.object({
  first_name: z.string().min(1, "First name is required").max(200),
  last_name: z.string().max(200).optional().or(z.literal("")),
  email: z.email("Please enter a valid email address"),
  phone: z.string().max(50).optional().or(z.literal("")),
  role_id: z.string().min(1, "Role is required"),
  status: z.string().min(1),
  profile_picture_url: z.string().optional().or(z.literal("")),
})

type EditFormValues = z.infer<typeof editSchema>

function defaultsFromUser(user: User): EditFormValues {
  return {
    first_name: user.first_name,
    last_name: user.last_name ?? "",
    email: user.email,
    phone: user.phone ?? "",
    role_id: user.role_id,
    status: user.status,
    profile_picture_url: user.profile_picture_url ?? "",
  }
}

const STATUS_OPTIONS: { value: "active" | "inactive" | "suspended"; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "suspended", label: "Suspended" },
]

export function UserDetailView({ userId }: { userId: string }) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { has } = usePermissions()
  const me = getStoredUser()

  const [editing, setEditing] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)

  const query = useQuery({
    queryKey: ["user", userId],
    queryFn: () => getUser(userId),
  })

  const rolesQuery = useQuery({
    queryKey: ["roles", { include_inactive: false }],
    queryFn: () => getRoles({ include_inactive: false }),
  })

  const user = query.data
  const isSelf = !!me && !!user && user.id === me.id
  const canUpdate = has("users.update")
  const canEditProfile = isSelf || canUpdate
  const canEditRoleStatus = canUpdate && !isSelf
  const canResetPassword = canUpdate && !isSelf

  const {
    register,
    handleSubmit,
    control,
    reset,
    setError,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<EditFormValues>({
    resolver: zodResolver(editSchema),
    values: user ? defaultsFromUser(user) : undefined,
  })

  function startEditing() {
    setEditing(true)
  }

  function cancelEditing() {
    if (user) reset(defaultsFromUser(user))
    setEditing(false)
  }

  async function onSubmit(values: EditFormValues) {
    if (!user) return
    try {
      let updated: User = user

      if (isSelf) {
        const patch: UserSelfUpdateInput = {}
        if (values.first_name !== user.first_name) patch.first_name = values.first_name
        if ((values.last_name || null) !== user.last_name) patch.last_name = values.last_name || null
        if ((values.phone || null) !== user.phone) patch.phone = values.phone || null
        if ((values.profile_picture_url || null) !== user.profile_picture_url) {
          patch.profile_picture_url = values.profile_picture_url || null
        }
        if (Object.keys(patch).length > 0) {
          updated = await updateMe(patch)
          setStoredUser(updated)
        }
      } else {
        const patch: UserUpdateInput = {}
        if (values.first_name !== user.first_name) patch.first_name = values.first_name
        if ((values.last_name || null) !== user.last_name) patch.last_name = values.last_name || null
        if (values.email !== user.email) patch.email = values.email
        if ((values.phone || null) !== user.phone) patch.phone = values.phone || null
        if (values.role_id !== user.role_id) patch.role_id = values.role_id
        if ((values.profile_picture_url || null) !== user.profile_picture_url) {
          patch.profile_picture_url = values.profile_picture_url || null
        }
        if (Object.keys(patch).length > 0) {
          updated = await updateUser(userId, patch)
        }
        if (values.status !== user.status && (values.status === "active" || values.status === "inactive" || values.status === "suspended")) {
          updated = await setUserStatus(userId, { status: values.status })
        }
      }

      toast.success("Profile updated.")
      queryClient.setQueryData(["user", userId], updated)
      queryClient.invalidateQueries({ queryKey: ["users"] })
      queryClient.invalidateQueries({ queryKey: ["users-stat"] })
      setEditing(false)
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "missing_permission") markPermissionDenied("users.update")
        if (err.code === "email_exists") {
          setError("email", { type: "manual", message: err.message })
        } else {
          toast.error(err.message)
        }
      } else {
        toast.error("Something went wrong. Please try again.")
      }
    }
  }

  const forbidden = query.error instanceof ApiError && query.error.code === "missing_permission"
  const notFound = query.error instanceof ApiError && query.error.code === "user_not_found"

  if (forbidden) {
    return (
      <EmptyState
        icon={ShieldOff}
        title="You don't have access to this user"
        description="Ask an administrator to grant you the users.view permission."
      />
    )
  }

  if (notFound) {
    return (
      <EmptyState
        icon={UserRound}
        title="User not found"
        description="This user may have been removed. Go back to Users and try again."
        action={{ label: "Back to Users", onClick: () => router.push("/users") }}
      />
    )
  }

  if (query.isError) {
    return <ErrorState message={(query.error as Error).message} onRetry={() => query.refetch()} />
  }

  if (query.isLoading || !user) {
    return (
      <div className="space-y-8">
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    )
  }

  const name = `${user.first_name} ${user.last_name ?? ""}`.trim()
  const currentRole = rolesQuery.data?.find((role) => role.id === user.role_id)
  const avatarUrl = watch("profile_picture_url")

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/users"
          className="mb-2 inline-flex items-center gap-1.5 text-sm font-medium text-on-surface-variant transition-colors hover:text-primary"
        >
          <ArrowLeft aria-hidden className="size-4" />
          Back to Users
        </Link>
        <Breadcrumbs
          items={[{ label: "User Management" }, { label: "Users", href: "/users" }, { label: name }]}
        />
      </div>

      <div className="flex flex-col gap-6 rounded-xl border border-outline-variant bg-surface-container-lowest p-6 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-6">
          {editing && canEditProfile ? (
            <PhotoPicker
              value={avatarUrl ?? ""}
              onChange={(url) => setValue("profile_picture_url", url, { shouldDirty: true })}
              fallbackText={initials(user.first_name, user.last_name)}
            />
          ) : (
            <Avatar className="size-24 border-2 border-surface-container-low">
              <AvatarImage src={user.profile_picture_url ?? undefined} alt={name} />
              <AvatarFallback className="bg-secondary-container text-2xl font-bold text-on-secondary-container">
                {initials(user.first_name, user.last_name)}
              </AvatarFallback>
            </Avatar>
          )}
          <div>
            <div className="mb-1 flex flex-wrap items-center gap-3">
              <h1 className="text-[32px] leading-10 font-semibold tracking-[-0.02em] text-on-surface">{name}</h1>
              <RoleBadge role={currentRole} fallbackLabel="—" />
              <StatusBadge status={user.status} tone={USER_STATUS_TONE[user.status]} />
            </div>
            <p className="text-sm text-on-surface-variant">{user.email}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3 self-start md:self-auto">
          {canEditProfile &&
            (editing ? (
              <Button
                type="button"
                variant="outline"
                onClick={cancelEditing}
                className="h-10 gap-2 rounded-lg px-4 text-sm font-medium"
              >
                <X aria-hidden className="size-4" />
                Cancel
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                onClick={startEditing}
                className="h-10 gap-2 rounded-lg px-4 text-sm font-medium"
              >
                <Pencil aria-hidden className="size-4" />
                Edit Info
              </Button>
            ))}
          {canResetPassword && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setResetOpen(true)}
              className="h-10 gap-2 rounded-lg px-4 text-sm font-medium"
            >
              <KeyRound aria-hidden className="size-4" />
              Reset Password
            </Button>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6">
        <h3 className="mb-6 flex items-center gap-2 text-lg font-semibold text-on-surface">
          <IdCard aria-hidden className="size-5 text-primary" />
          Account Information
        </h3>

        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className="grid grid-cols-1 gap-x-4 gap-y-6 md:grid-cols-2">
            {editing && canEditProfile ? (
              <Field data-invalid={!!errors.first_name}>
                <FieldLabel htmlFor="detail-first-name">
                  First Name <span className="text-destructive">*</span>
                </FieldLabel>
                <Input id="detail-first-name" {...register("first_name")} aria-invalid={!!errors.first_name} />
                <FieldError errors={[errors.first_name]} />
              </Field>
            ) : (
              <InfoRow label="First Name" value={user.first_name} />
            )}

            {editing && canEditProfile ? (
              <Field data-invalid={!!errors.last_name}>
                <FieldLabel htmlFor="detail-last-name">Last Name</FieldLabel>
                <Input id="detail-last-name" {...register("last_name")} aria-invalid={!!errors.last_name} />
                <FieldError errors={[errors.last_name]} />
              </Field>
            ) : (
              <InfoRow label="Last Name" value={user.last_name} />
            )}

            {editing && canEditRoleStatus ? (
              <Field data-invalid={!!errors.email}>
                <FieldLabel htmlFor="detail-email">
                  Email <span className="text-destructive">*</span>
                </FieldLabel>
                <Input id="detail-email" type="email" {...register("email")} aria-invalid={!!errors.email} />
                <FieldError errors={[errors.email]} />
              </Field>
            ) : (
              <InfoRow label="Email" value={user.email} />
            )}

            {editing && canEditProfile ? (
              <Field data-invalid={!!errors.phone}>
                <FieldLabel htmlFor="detail-phone">Phone</FieldLabel>
                <Input id="detail-phone" {...register("phone")} aria-invalid={!!errors.phone} />
                <FieldError errors={[errors.phone]} />
              </Field>
            ) : (
              <InfoRow label="Phone" value={user.phone} />
            )}

            {editing && canEditRoleStatus ? (
              <Field data-invalid={!!errors.role_id}>
                <FieldLabel htmlFor="detail-role">
                  Role <span className="text-destructive">*</span>
                </FieldLabel>
                <Controller
                  control={control}
                  name="role_id"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={(value) => value && field.onChange(value)}>
                      <SelectTrigger id="detail-role" className="w-full" aria-invalid={!!errors.role_id}>
                        <SelectValue>
                          {(value: string) => rolesQuery.data?.find((role) => role.id === value)?.name ?? "Select a role"}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {rolesQuery.data?.map((role) => (
                          <SelectItem key={role.id} value={role.id}>
                            {role.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldError errors={[errors.role_id]} />
              </Field>
            ) : (
              <InfoRow label="Role" value={<RoleBadge role={currentRole} fallbackLabel="—" />} />
            )}

            {editing && canEditRoleStatus ? (
              <Field data-invalid={!!errors.status}>
                <FieldLabel htmlFor="detail-status">Status</FieldLabel>
                <Controller
                  control={control}
                  name="status"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={(value) => value && field.onChange(value)}>
                      <SelectTrigger id="detail-status" className="w-full" aria-invalid={!!errors.status}>
                        <SelectValue>
                          {(value: string) => STATUS_OPTIONS.find((o) => o.value === value)?.label ?? value}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldError errors={[errors.status]} />
              </Field>
            ) : (
              <InfoRow
                label="Status"
                value={<StatusBadge status={user.status} tone={USER_STATUS_TONE[user.status]} />}
              />
            )}

            <InfoRow label="Created" value={formatDate(user.created_at)} />
            <InfoRow label="Last Login" value={formatLastLogin(user.last_login_at)} />
          </div>

          {editing && (
            <div className="mt-6 flex justify-end gap-3 border-t border-outline-variant pt-6">
              <Button type="button" variant="outline" onClick={cancelEditing}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Saving…" : "Save Changes"}
              </Button>
            </div>
          )}
        </form>
      </div>

      {canResetPassword && (
        <ResetPasswordDialog open={resetOpen} onOpenChange={setResetOpen} userId={userId} userName={name} />
      )}
    </div>
  )
}
