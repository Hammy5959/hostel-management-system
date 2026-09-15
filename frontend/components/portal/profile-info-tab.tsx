"use client"

import { useState } from "react"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { GraduationCap, Pencil, User, Users, X } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ErrorState } from "@/components/hostel/error-state"
import { PhotoPicker } from "@/components/residents/photo-picker"
import { initials } from "@/components/users/user-badges"
import { useMyResident } from "@/components/portal/resident-provider"
import { ApiError, updateMyResident } from "@/lib/api"
import type { Resident, ResidentUpdateInput } from "@/lib/types"

// Mirrors resident-form-dialog.tsx's GENDER_OPTIONS (not exported there).
const GENDER_OPTIONS = ["Male", "Female", "Other"]

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

const optionalText = (max?: number) => {
  const base = max ? z.string().max(max) : z.string()
  return base.optional().or(z.literal(""))
}

const profileSchema = z.object({
  first_name: z.string().min(1, "First name is required").max(200),
  last_name: optionalText(200),
  phone: optionalText(50),
  email: z.email("Please enter a valid email address").max(255).optional().or(z.literal("")),
  address: optionalText(),
  date_of_birth: optionalText(),
  gender: optionalText(50),
  guardian_name: optionalText(),
  guardian_relationship: optionalText(),
  guardian_phone: optionalText(),
  guardian_address: optionalText(),
  profile_picture_url: optionalText(),
})

type ProfileFormValues = z.infer<typeof profileSchema>

function defaultsFromResident(resident: Resident): ProfileFormValues {
  return {
    first_name: resident.first_name,
    last_name: resident.last_name ?? "",
    phone: resident.phone ?? "",
    email: resident.email ?? "",
    address: resident.address ?? "",
    date_of_birth: resident.date_of_birth ?? "",
    gender: resident.gender ?? "",
    guardian_name: resident.guardian_name ?? "",
    guardian_relationship: resident.guardian_relationship ?? "",
    guardian_phone: resident.guardian_phone ?? "",
    guardian_address: resident.guardian_address ?? "",
    profile_picture_url: resident.profile_picture_url ?? "",
  }
}

export function ProfileInfoTab() {
  const { resident, isLoading, error, refetch } = useMyResident()
  const [editing, setEditing] = useState(false)

  const {
    register,
    handleSubmit,
    control,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    values: resident ? defaultsFromResident(resident) : undefined,
  })

  function startEditing() {
    setEditing(true)
  }

  function cancelEditing() {
    if (resident) reset(defaultsFromResident(resident))
    setEditing(false)
  }

  async function onSubmit(values: ProfileFormValues) {
    if (!resident) return
    try {
      const patch: ResidentUpdateInput = {}
      if (values.first_name !== resident.first_name) patch.first_name = values.first_name
      if ((values.last_name || null) !== resident.last_name) patch.last_name = values.last_name || null
      if ((values.phone || null) !== resident.phone) patch.phone = values.phone || null
      if ((values.email || null) !== resident.email) patch.email = values.email || null
      if ((values.address || null) !== resident.address) patch.address = values.address || null
      if ((values.date_of_birth || null) !== resident.date_of_birth) patch.date_of_birth = values.date_of_birth || null
      if ((values.gender || null) !== resident.gender) patch.gender = values.gender || null
      if ((values.guardian_name || null) !== resident.guardian_name) patch.guardian_name = values.guardian_name || null
      if ((values.guardian_relationship || null) !== resident.guardian_relationship) {
        patch.guardian_relationship = values.guardian_relationship || null
      }
      if ((values.guardian_phone || null) !== resident.guardian_phone) patch.guardian_phone = values.guardian_phone || null
      if ((values.guardian_address || null) !== resident.guardian_address) {
        patch.guardian_address = values.guardian_address || null
      }
      if ((values.profile_picture_url || null) !== resident.profile_picture_url) {
        patch.profile_picture_url = values.profile_picture_url || null
      }

      if (Object.keys(patch).length > 0) {
        await updateMyResident(patch)
        refetch()
      }
      toast.success("Profile updated.")
      setEditing(false)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Something went wrong. Please try again.")
    }
  }

  if (error) {
    return <ErrorState message="Something went wrong loading your profile." onRetry={refetch} />
  }

  if (isLoading || !resident) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    )
  }

  const name = `${resident.first_name} ${resident.last_name ?? ""}`.trim()
  const avatarUrl = watch("profile_picture_url")

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-6 rounded-xl border border-outline-variant bg-surface-container-lowest p-6 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-6">
          {editing ? (
            <PhotoPicker
              value={avatarUrl ?? ""}
              onChange={(url) => setValue("profile_picture_url", url, { shouldDirty: true })}
              fallbackText={initials(resident.first_name, resident.last_name)}
            />
          ) : (
            <Avatar className="size-24 border-2 border-surface-container-low">
              <AvatarImage src={resident.profile_picture_url ?? undefined} alt={name} />
              <AvatarFallback className="bg-secondary-container text-2xl font-bold text-on-secondary-container">
                {initials(resident.first_name, resident.last_name)}
              </AvatarFallback>
            </Avatar>
          )}
          <div>
            <h1 className="text-[32px] leading-10 font-semibold tracking-[-0.02em] text-on-surface">{name}</h1>
            <p className="text-sm text-on-surface-variant">{resident.email || "—"}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3 self-start md:self-auto">
          {editing ? (
            <Button type="button" variant="outline" onClick={cancelEditing} className="h-10 gap-2 rounded-lg px-4 text-sm font-medium">
              <X aria-hidden className="size-4" />
              Cancel
            </Button>
          ) : (
            <Button type="button" variant="outline" onClick={startEditing} className="h-10 gap-2 rounded-lg px-4 text-sm font-medium">
              <Pencil aria-hidden className="size-4" />
              Edit Profile
            </Button>
          )}
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6">
          <h3 className="mb-6 flex items-center gap-2 text-lg font-semibold text-on-surface">
            <User aria-hidden className="size-5 text-primary" />
            Personal Information
          </h3>
          <div className="grid grid-cols-1 gap-x-4 gap-y-6 md:grid-cols-2">
            {editing ? (
              <Field data-invalid={!!errors.first_name}>
                <FieldLabel htmlFor="profile-first-name">
                  First Name <span className="text-destructive">*</span>
                </FieldLabel>
                <Input id="profile-first-name" {...register("first_name")} aria-invalid={!!errors.first_name} />
                <FieldError errors={[errors.first_name]} />
              </Field>
            ) : (
              <InfoRow label="First Name" value={resident.first_name} />
            )}

            {editing ? (
              <Field data-invalid={!!errors.last_name}>
                <FieldLabel htmlFor="profile-last-name">Last Name</FieldLabel>
                <Input id="profile-last-name" {...register("last_name")} aria-invalid={!!errors.last_name} />
                <FieldError errors={[errors.last_name]} />
              </Field>
            ) : (
              <InfoRow label="Last Name" value={resident.last_name} />
            )}

            {editing ? (
              <Field data-invalid={!!errors.email}>
                <FieldLabel htmlFor="profile-email">Email</FieldLabel>
                <Input id="profile-email" type="email" {...register("email")} aria-invalid={!!errors.email} />
                <FieldError errors={[errors.email]} />
              </Field>
            ) : (
              <InfoRow label="Email" value={resident.email} />
            )}

            {editing ? (
              <Field data-invalid={!!errors.phone}>
                <FieldLabel htmlFor="profile-phone">Phone</FieldLabel>
                <Input id="profile-phone" type="tel" {...register("phone")} aria-invalid={!!errors.phone} />
                <FieldError errors={[errors.phone]} />
              </Field>
            ) : (
              <InfoRow label="Phone" value={resident.phone} />
            )}

            {editing ? (
              <Field data-invalid={!!errors.date_of_birth}>
                <FieldLabel htmlFor="profile-dob">Date of Birth</FieldLabel>
                <Input id="profile-dob" type="date" {...register("date_of_birth")} aria-invalid={!!errors.date_of_birth} />
                <FieldError errors={[errors.date_of_birth]} />
              </Field>
            ) : (
              <InfoRow label="Date of Birth" value={resident.date_of_birth} />
            )}

            {editing ? (
              <Field>
                <FieldLabel htmlFor="profile-gender">Gender</FieldLabel>
                <Controller
                  control={control}
                  name="gender"
                  render={({ field }) => (
                    <Select value={field.value || "unset"} onValueChange={(value) => field.onChange(value === "unset" ? "" : value)}>
                      <SelectTrigger id="profile-gender" className="w-full">
                        <SelectValue placeholder="Select…" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unset">Select…</SelectItem>
                        {GENDER_OPTIONS.map((option) => (
                          <SelectItem key={option} value={option}>
                            {option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>
            ) : (
              <InfoRow label="Gender" value={resident.gender} />
            )}

            {editing ? (
              <Field className="md:col-span-2" data-invalid={!!errors.address}>
                <FieldLabel htmlFor="profile-address">Address</FieldLabel>
                <Input id="profile-address" {...register("address")} aria-invalid={!!errors.address} />
                <FieldError errors={[errors.address]} />
              </Field>
            ) : (
              <InfoRow className="md:col-span-2" label="Address" value={resident.address} />
            )}
          </div>
        </div>

        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6">
          <h3 className="mb-6 flex items-center gap-2 text-lg font-semibold text-on-surface">
            <Users aria-hidden className="size-5 text-primary" />
            Guardian Information
          </h3>
          <div className="grid grid-cols-1 gap-x-4 gap-y-6 md:grid-cols-2">
            {editing ? (
              <Field data-invalid={!!errors.guardian_name}>
                <FieldLabel htmlFor="profile-guardian-name">Guardian Name</FieldLabel>
                <Input id="profile-guardian-name" {...register("guardian_name")} aria-invalid={!!errors.guardian_name} />
                <FieldError errors={[errors.guardian_name]} />
              </Field>
            ) : (
              <InfoRow label="Name" value={resident.guardian_name} />
            )}

            {editing ? (
              <Field data-invalid={!!errors.guardian_relationship}>
                <FieldLabel htmlFor="profile-guardian-relationship">Relationship</FieldLabel>
                <Input
                  id="profile-guardian-relationship"
                  {...register("guardian_relationship")}
                  aria-invalid={!!errors.guardian_relationship}
                />
                <FieldError errors={[errors.guardian_relationship]} />
              </Field>
            ) : (
              <InfoRow label="Relationship" value={resident.guardian_relationship} />
            )}

            {editing ? (
              <Field data-invalid={!!errors.guardian_phone}>
                <FieldLabel htmlFor="profile-guardian-phone">Phone</FieldLabel>
                <Input id="profile-guardian-phone" type="tel" {...register("guardian_phone")} aria-invalid={!!errors.guardian_phone} />
                <FieldError errors={[errors.guardian_phone]} />
              </Field>
            ) : (
              <InfoRow label="Phone" value={resident.guardian_phone} />
            )}

            {editing ? (
              <Field data-invalid={!!errors.guardian_address}>
                <FieldLabel htmlFor="profile-guardian-address">Address</FieldLabel>
                <Input id="profile-guardian-address" {...register("guardian_address")} aria-invalid={!!errors.guardian_address} />
                <FieldError errors={[errors.guardian_address]} />
              </Field>
            ) : (
              <InfoRow label="Address" value={resident.guardian_address} />
            )}
          </div>
        </div>

        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6">
          <h3 className="mb-6 flex items-center gap-2 text-lg font-semibold text-on-surface">
            <GraduationCap aria-hidden className="size-5 text-primary" />
            Academic Information
          </h3>
          <div className="grid grid-cols-1 gap-x-4 gap-y-6 md:grid-cols-2">
            <InfoRow label="Student ID" value={resident.student_id} />
            <InfoRow label="Institution" value={resident.institution} />
            <InfoRow className="md:col-span-2" label="Department" value={resident.department} />
            <InfoRow label="Program" value={resident.program} />
            <InfoRow label="Semester" value={resident.semester} />
          </div>
        </div>

        {editing && (
          <div className="flex justify-end gap-3 border-t border-outline-variant pt-6">
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
  )
}
