"use client"

import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { Building2, Globe2, Image as ImageIcon, MapPin, Pencil, Trash2, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import { PageHeader } from "@/components/hostel/page-header"
import { ErrorState } from "@/components/hostel/error-state"
import { PhotoPicker } from "@/components/residents/photo-picker"

import { usePermissions, markPermissionDenied } from "@/lib/permissions"
import { setStoredBranding } from "@/lib/auth"
import { useHostelSettings } from "@/lib/hostel-settings"
import { ApiError, updateHostelSettings } from "@/lib/api"
import type { HostelSettings, HostelSettingsUpdateInput } from "@/lib/types"

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

const TIMEZONE_OPTIONS = [
  { value: "Asia/Karachi", label: "Asia/Karachi (PKT, UTC+05:00)" },
  { value: "UTC", label: "UTC (UTC+00:00)" },
  { value: "Europe/London", label: "Europe/London (GMT/BST)" },
  { value: "Asia/Dubai", label: "Asia/Dubai (GST, UTC+04:00)" },
  { value: "Asia/Kolkata", label: "Asia/Kolkata (IST, UTC+05:30)" },
  { value: "Asia/Dhaka", label: "Asia/Dhaka (UTC+06:00)" },
  { value: "Asia/Riyadh", label: "Asia/Riyadh (UTC+03:00)" },
  { value: "Asia/Singapore", label: "Asia/Singapore (UTC+08:00)" },
  { value: "Asia/Shanghai", label: "Asia/Shanghai (UTC+08:00)" },
  { value: "Asia/Tokyo", label: "Asia/Tokyo (UTC+09:00)" },
  { value: "Europe/Berlin", label: "Europe/Berlin (CET/CEST)" },
  { value: "America/New_York", label: "America/New_York (EST/EDT)" },
  { value: "America/Chicago", label: "America/Chicago (CST/CDT)" },
  { value: "America/Los_Angeles", label: "America/Los_Angeles (PST/PDT)" },
  { value: "Australia/Sydney", label: "Australia/Sydney (AEST/AEDT)" },
] as const

const CURRENCY_OPTIONS = [
  { value: "PKR", label: "PKR — Pakistani Rupee (₨)" },
  { value: "USD", label: "USD — US Dollar ($)" },
  { value: "GBP", label: "GBP — British Pound (£)" },
  { value: "EUR", label: "EUR — Euro (€)" },
  { value: "AED", label: "AED — UAE Dirham" },
  { value: "SAR", label: "SAR — Saudi Riyal" },
  { value: "INR", label: "INR — Indian Rupee (₹)" },
  { value: "CNY", label: "CNY — Chinese Yuan (¥)" },
  { value: "CAD", label: "CAD — Canadian Dollar" },
  { value: "AUD", label: "AUD — Australian Dollar" },
] as const

const settingsSchema = z.object({
  hostel_name: z.string().min(1, "Hostel name is required").max(200),
  hostel_code: optionalText(50),
  total_capacity: z.string().optional().or(z.literal("")),
  logo_url: optionalText(),
  email: z.email("Please enter a valid email address").optional().or(z.literal("")),
  phone: optionalText(50),
  address: optionalText(),
  city: optionalText(),
  state: optionalText(),
  country: optionalText(),
  timezone: optionalText(),
  currency: optionalText(3),
})

type SettingsFormValues = z.infer<typeof settingsSchema>

function defaultsFromSettings(settings: HostelSettings): SettingsFormValues {
  return {
    hostel_name: settings.hostel_name,
    hostel_code: settings.hostel_code ?? "",
    total_capacity: settings.total_capacity != null ? String(settings.total_capacity) : "",
    logo_url: settings.logo_url ?? "",
    email: settings.email ?? "",
    phone: settings.phone ?? "",
    address: settings.address ?? "",
    city: settings.city ?? "",
    state: settings.state ?? "",
    country: settings.country ?? "",
    timezone: settings.timezone ?? "",
    currency: settings.currency ?? "",
  }
}

export function SettingsView() {
  const queryClient = useQueryClient()
  const { has } = usePermissions()
  const canManage = has("hostel_settings.manage")

  const [editing, setEditing] = useState(false)

  const query = useHostelSettings()
  const settings = query.data

  const {
    register,
    handleSubmit,
    control,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsSchema),
    values: settings ? defaultsFromSettings(settings) : undefined,
  })

  function startEditing() {
    setEditing(true)
  }

  function cancelEditing() {
    if (settings) reset(defaultsFromSettings(settings))
    setEditing(false)
  }

  async function onSubmit(values: SettingsFormValues) {
    if (!settings) return
    try {
      const patch: HostelSettingsUpdateInput = {}
      if (values.hostel_name !== settings.hostel_name) patch.hostel_name = values.hostel_name
      if ((values.hostel_code || null) !== settings.hostel_code) patch.hostel_code = values.hostel_code || null
      const newCapacity = values.total_capacity ? Number(values.total_capacity) : null
      if (newCapacity !== settings.total_capacity) patch.total_capacity = newCapacity
      if ((values.logo_url || null) !== settings.logo_url) patch.logo_url = values.logo_url || null
      if ((values.email || null) !== settings.email) patch.email = values.email || null
      if ((values.phone || null) !== settings.phone) patch.phone = values.phone || null
      if ((values.address || null) !== settings.address) patch.address = values.address || null
      if ((values.city || null) !== settings.city) patch.city = values.city || null
      if ((values.state || null) !== settings.state) patch.state = values.state || null
      if ((values.country || null) !== settings.country) patch.country = values.country || null
      if ((values.timezone || null) !== settings.timezone) patch.timezone = values.timezone || null
      if ((values.currency || null) !== settings.currency) patch.currency = values.currency || null

      if (Object.keys(patch).length > 0) {
        const updated = await updateHostelSettings(patch)
        queryClient.setQueryData(["hostel-settings"], updated)
        // Keep this user's own synchronous branding cache current too — so
        // *their* very next refresh doesn't flash back to the pre-save
        // name/logo before the live query corrects it (see lib/auth.ts).
        setStoredBranding({
          hostel_name: updated.hostel_name,
          logo_url: updated.logo_url,
          timezone: updated.timezone,
          currency: updated.currency,
        })
        toast.success("Hostel settings updated.")
      }
      setEditing(false)
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "missing_permission") markPermissionDenied("hostel_settings.manage")
        toast.error(err.message)
      } else {
        toast.error("Something went wrong. Please try again.")
      }
    }
  }

  if (query.isError) {
    return <ErrorState message={(query.error as Error).message} onRetry={() => query.refetch()} />
  }

  if (query.isLoading || !settings) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    )
  }

  const logoUrl = watch("logo_url")

  return (
    <div className="space-y-6">
      <PageHeader
        title="Hostel Settings"
        description="Manage your hostel's profile, branding, contact details, and localization preferences."
        actions={
          canManage
            ? editing
              ? (
                <Button type="button" variant="outline" onClick={cancelEditing} className="gap-2">
                  <X aria-hidden className="size-4" />
                  Cancel
                </Button>
              )
              : (
                <Button type="button" variant="outline" onClick={startEditing} className="gap-2">
                  <Pencil aria-hidden className="size-4" />
                  Edit
                </Button>
              )
            : undefined
        }
      />

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6">
          <h3 className="mb-6 flex items-center gap-2 text-lg font-semibold text-on-surface">
            <Building2 aria-hidden className="size-5 text-primary" />
            Hostel Profile
          </h3>
          <FieldGroup className="grid grid-cols-1 gap-x-4 gap-y-6 md:grid-cols-2">
            {editing && canManage ? (
              <Field data-invalid={!!errors.hostel_name}>
                <FieldLabel htmlFor="settings-hostel-name">
                  Hostel Name <span className="text-destructive">*</span>
                </FieldLabel>
                <Input id="settings-hostel-name" {...register("hostel_name")} aria-invalid={!!errors.hostel_name} />
                <FieldError errors={[errors.hostel_name]} />
              </Field>
            ) : (
              <InfoRow label="Hostel Name" value={settings.hostel_name} />
            )}

            {editing && canManage ? (
              <Field data-invalid={!!errors.hostel_code}>
                <FieldLabel htmlFor="settings-hostel-code">Hostel Code</FieldLabel>
                <Input id="settings-hostel-code" {...register("hostel_code")} aria-invalid={!!errors.hostel_code} />
                <FieldError errors={[errors.hostel_code]} />
              </Field>
            ) : (
              <InfoRow label="Hostel Code" value={settings.hostel_code} />
            )}

            {editing && canManage ? (
              <Field data-invalid={!!errors.total_capacity}>
                <FieldLabel htmlFor="settings-total-capacity">Total Capacity (Beds)</FieldLabel>
                <Input
                  id="settings-total-capacity"
                  type="number"
                  min={0}
                  {...register("total_capacity")}
                  aria-invalid={!!errors.total_capacity}
                />
                <FieldError errors={[errors.total_capacity]} />
              </Field>
            ) : (
              <InfoRow label="Total Capacity (Beds)" value={settings.total_capacity} />
            )}
          </FieldGroup>
        </div>

        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6">
          <h3 className="mb-1 flex items-center gap-2 text-lg font-semibold text-on-surface">
            <ImageIcon aria-hidden className="size-5 text-primary" />
            Branding
          </h3>
          <p className="mb-6 text-sm text-on-surface-variant">Shown in the navigation sidebar and topbar.</p>
          {editing && canManage ? (
            <div className="flex items-center gap-3">
              <PhotoPicker
                value={logoUrl ?? ""}
                onChange={(url) => setValue("logo_url", url, { shouldDirty: true })}
                fallbackText={settings.hostel_name.slice(0, 2).toUpperCase()}
              />
              {logoUrl && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setValue("logo_url", "", { shouldDirty: true })}
                  className="gap-2 text-destructive hover:text-destructive"
                >
                  <Trash2 aria-hidden className="size-4" />
                  Remove Logo
                </Button>
              )}
            </div>
          ) : settings.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={settings.logo_url}
              alt={settings.hostel_name}
              className="size-16 rounded-lg border border-outline-variant object-contain"
            />
          ) : (
            <p className="text-sm text-on-surface-variant italic">No logo uploaded.</p>
          )}
        </div>

        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6">
          <h3 className="mb-6 flex items-center gap-2 text-lg font-semibold text-on-surface">
            <MapPin aria-hidden className="size-5 text-primary" />
            Contact &amp; Address
          </h3>
          <FieldGroup className="grid grid-cols-1 gap-x-4 gap-y-6 md:grid-cols-2">
            {editing && canManage ? (
              <Field data-invalid={!!errors.email}>
                <FieldLabel htmlFor="settings-email">Email</FieldLabel>
                <Input id="settings-email" type="email" {...register("email")} aria-invalid={!!errors.email} />
                <FieldError errors={[errors.email]} />
              </Field>
            ) : (
              <InfoRow label="Email" value={settings.email} />
            )}

            {editing && canManage ? (
              <Field data-invalid={!!errors.phone}>
                <FieldLabel htmlFor="settings-phone">Phone</FieldLabel>
                <Input id="settings-phone" {...register("phone")} aria-invalid={!!errors.phone} />
                <FieldError errors={[errors.phone]} />
              </Field>
            ) : (
              <InfoRow label="Phone" value={settings.phone} />
            )}

            {editing && canManage ? (
              <Field className="md:col-span-2" data-invalid={!!errors.address}>
                <FieldLabel htmlFor="settings-address">Address</FieldLabel>
                <Input id="settings-address" {...register("address")} aria-invalid={!!errors.address} />
                <FieldError errors={[errors.address]} />
              </Field>
            ) : (
              <InfoRow className="md:col-span-2" label="Address" value={settings.address} />
            )}

            {editing && canManage ? (
              <Field data-invalid={!!errors.city}>
                <FieldLabel htmlFor="settings-city">City</FieldLabel>
                <Input id="settings-city" {...register("city")} aria-invalid={!!errors.city} />
                <FieldError errors={[errors.city]} />
              </Field>
            ) : (
              <InfoRow label="City" value={settings.city} />
            )}

            {editing && canManage ? (
              <Field data-invalid={!!errors.state}>
                <FieldLabel htmlFor="settings-state">State / Province</FieldLabel>
                <Input id="settings-state" {...register("state")} aria-invalid={!!errors.state} />
                <FieldError errors={[errors.state]} />
              </Field>
            ) : (
              <InfoRow label="State / Province" value={settings.state} />
            )}

            {editing && canManage ? (
              <Field data-invalid={!!errors.country}>
                <FieldLabel htmlFor="settings-country">Country</FieldLabel>
                <Input id="settings-country" {...register("country")} aria-invalid={!!errors.country} />
                <FieldError errors={[errors.country]} />
              </Field>
            ) : (
              <InfoRow label="Country" value={settings.country} />
            )}
          </FieldGroup>
        </div>

        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6">
          <h3 className="mb-6 flex items-center gap-2 text-lg font-semibold text-on-surface">
            <Globe2 aria-hidden className="size-5 text-primary" />
            Localization
          </h3>
          <FieldGroup className="grid grid-cols-1 gap-x-4 gap-y-6 md:grid-cols-2">
            {editing && canManage ? (
              <Field data-invalid={!!errors.timezone}>
                <FieldLabel htmlFor="settings-timezone">Timezone</FieldLabel>
                <Controller
                  control={control}
                  name="timezone"
                  render={({ field }) => (
                    <Select
                      value={field.value || "unset"}
                      onValueChange={(value) => field.onChange(value === "unset" ? "" : value)}
                    >
                      <SelectTrigger id="settings-timezone" className="w-full">
                        <SelectValue placeholder="Select a timezone…" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unset">Select a timezone…</SelectItem>
                        {TIMEZONE_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldError errors={[errors.timezone]} />
              </Field>
            ) : (
              <InfoRow
                label="Timezone"
                value={TIMEZONE_OPTIONS.find((o) => o.value === settings.timezone)?.label ?? settings.timezone}
              />
            )}

            {editing && canManage ? (
              <Field data-invalid={!!errors.currency}>
                <FieldLabel htmlFor="settings-currency">Currency</FieldLabel>
                <Controller
                  control={control}
                  name="currency"
                  render={({ field }) => (
                    <Select
                      value={field.value || "unset"}
                      onValueChange={(value) => field.onChange(value === "unset" ? "" : value)}
                    >
                      <SelectTrigger id="settings-currency" className="w-full">
                        <SelectValue placeholder="Select a currency…" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unset">Select a currency…</SelectItem>
                        {CURRENCY_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldError errors={[errors.currency]} />
              </Field>
            ) : (
              <InfoRow
                label="Currency"
                value={CURRENCY_OPTIONS.find((o) => o.value === settings.currency)?.label ?? settings.currency}
              />
            )}
          </FieldGroup>
        </div>

        {editing && canManage && (
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
