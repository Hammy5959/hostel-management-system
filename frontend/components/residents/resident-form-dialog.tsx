"use client"

import { useQueryClient } from "@tanstack/react-query"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import { markPermissionDenied } from "@/lib/permissions"
import { ApiError, createResident, updateResident } from "@/lib/api"
import type { Resident, ResidentStatus } from "@/lib/types"
import { PhotoPicker } from "@/components/residents/photo-picker"

export const RESIDENT_STATUS_OPTIONS: { value: ResidentStatus; label: string }[] = [
  { value: "applicant", label: "Applicant" },
  { value: "active", label: "Active" },
  { value: "on_leave", label: "On Leave" },
  { value: "checked_out", label: "Checked Out" },
  { value: "inactive", label: "Inactive" },
]

const GENDER_OPTIONS = ["Male", "Female", "Other"]

const optionalText = (max?: number) => {
  const base = max ? z.string().max(max) : z.string()
  return base.optional().or(z.literal(""))
}

const residentSchema = z.object({
  first_name: z.string().min(1, "First name is required").max(200),
  last_name: optionalText(200),
  date_of_birth: optionalText(),
  gender: optionalText(50),
  email: z.email("Invalid email address").max(255).optional().or(z.literal("")),
  phone: optionalText(50),
  profile_picture_url: optionalText(),
  address: optionalText(),
  student_id: optionalText(100),
  institution: optionalText(200),
  department: optionalText(200),
  program: optionalText(200),
  semester: optionalText(100),
  guardian_name: optionalText(),
  guardian_relationship: optionalText(),
  guardian_phone: optionalText(),
  guardian_address: optionalText(),
  emergency_contact_name: optionalText(),
  emergency_contact_relationship: optionalText(),
  emergency_contact_phone: optionalText(),
})

type ResidentFormValues = z.infer<typeof residentSchema>

const DEFAULT_VALUES: ResidentFormValues = {
  first_name: "",
  last_name: "",
  date_of_birth: "",
  gender: "",
  email: "",
  phone: "",
  profile_picture_url: "",
  address: "",
  student_id: "",
  institution: "",
  department: "",
  program: "",
  semester: "",
  guardian_name: "",
  guardian_relationship: "",
  guardian_phone: "",
  guardian_address: "",
  emergency_contact_name: "",
  emergency_contact_relationship: "",
  emergency_contact_phone: "",
}

function valuesFromResident(resident: Resident | null): ResidentFormValues {
  if (!resident) return DEFAULT_VALUES
  return {
    first_name: resident.first_name,
    last_name: resident.last_name ?? "",
    date_of_birth: resident.date_of_birth ?? "",
    gender: resident.gender ?? "",
    email: resident.email ?? "",
    phone: resident.phone ?? "",
    profile_picture_url: resident.profile_picture_url ?? "",
    address: resident.address ?? "",
    student_id: resident.student_id ?? "",
    institution: resident.institution ?? "",
    department: resident.department ?? "",
    program: resident.program ?? "",
    semester: resident.semester ?? "",
    guardian_name: resident.guardian_name ?? "",
    guardian_relationship: resident.guardian_relationship ?? "",
    guardian_phone: resident.guardian_phone ?? "",
    guardian_address: resident.guardian_address ?? "",
    emergency_contact_name: resident.emergency_contact_name ?? "",
    emergency_contact_relationship: resident.emergency_contact_relationship ?? "",
    emergency_contact_phone: resident.emergency_contact_phone ?? "",
  }
}

function SectionHeading({
  children,
  first,
}: {
  children: React.ReactNode
  first?: boolean
}) {
  return (
    <h3
      className={
        "mb-4 text-xs font-semibold tracking-wider text-primary uppercase" +
        (first ? "" : " border-t border-outline-variant pt-6")
      }
    >
      {children}
    </h3>
  )
}

/** Create/edit dialog for a resident — used by the Residents list page's
 * "Add Resident" action (resident=null) and the Resident Detail page's
 * "Edit" action (resident=<the fetched resident>), mirroring how
 * RoomFormDialog serves both create and edit for rooms. */
export function ResidentFormDialog({
  open,
  onOpenChange,
  resident = null,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  resident?: Resident | null
}) {
  const queryClient = useQueryClient()
  const isEdit = !!resident

  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof residentSchema>, unknown, ResidentFormValues>({
    resolver: zodResolver(residentSchema),
    values: valuesFromResident(resident),
  })

  const photoUrl = watch("profile_picture_url") ?? ""
  const firstNameValue = watch("first_name")
  const lastNameValue = watch("last_name")
  const photoFallback =
    [firstNameValue, lastNameValue]
      .filter(Boolean)
      .map((part) => part!.trim()[0]?.toUpperCase())
      .filter(Boolean)
      .join("") || "?"

  async function onSubmit(values: ResidentFormValues) {
    const payload = {
      first_name: values.first_name,
      last_name: values.last_name || null,
      date_of_birth: values.date_of_birth || null,
      gender: values.gender || null,
      email: values.email || null,
      phone: values.phone || null,
      profile_picture_url: values.profile_picture_url || null,
      address: values.address || null,
      student_id: values.student_id || null,
      institution: values.institution || null,
      department: values.department || null,
      program: values.program || null,
      semester: values.semester || null,
      guardian_name: values.guardian_name || null,
      guardian_relationship: values.guardian_relationship || null,
      guardian_phone: values.guardian_phone || null,
      guardian_address: values.guardian_address || null,
      emergency_contact_name: values.emergency_contact_name || null,
      emergency_contact_relationship: values.emergency_contact_relationship || null,
      emergency_contact_phone: values.emergency_contact_phone || null,
    }
    try {
      if (isEdit && resident) {
        // Status is never editable here — it only ever changes through a
        // dedicated flow (admission approve/reject, resident checkout) that
        // owns its own transition rules.
        await updateResident(resident.id, payload)
        toast.success("Resident updated.")
        queryClient.invalidateQueries({ queryKey: ["resident", resident.id] })
      } else {
        // Status is never shown or sent on create — the backend defaults new
        // residents to "applicant".
        await createResident(payload)
        toast.success("Resident created.")
      }
      queryClient.invalidateQueries({ queryKey: ["residents"] })
      queryClient.invalidateQueries({ queryKey: ["resident-institutions"] })
      onOpenChange(false)
      if (!isEdit) reset(DEFAULT_VALUES)
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "missing_permission") {
          markPermissionDenied(isEdit ? "residents.update" : "residents.create")
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
        if (!next && !isEdit) reset(DEFAULT_VALUES)
      }}
    >
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-2xl">
        <DialogHeader className="shrink-0">
          <DialogTitle>{isEdit ? "Edit Resident" : "Add New Resident"}</DialogTitle>

          <DialogDescription>
            {isEdit
              ? "Update this resident's details."
              : "Enter the details for the new resident admission."}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit(onSubmit)}
          noValidate
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
            {/* Personal */}
            <section>
              <SectionHeading first>Personal Information</SectionHeading>
              <FieldGroup className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field data-invalid={!!errors.first_name}>
                  <FieldLabel htmlFor="resident-first-name">
                    First Name <span className="text-destructive">*</span>
                  </FieldLabel>
                  <Input id="resident-first-name" {...register("first_name")} aria-invalid={!!errors.first_name} />
                  <FieldError errors={[errors.first_name]} />
                </Field>

                <Field data-invalid={!!errors.last_name}>
                  <FieldLabel htmlFor="resident-last-name">Last Name</FieldLabel>
                  <Input id="resident-last-name" {...register("last_name")} aria-invalid={!!errors.last_name} />
                  <FieldError errors={[errors.last_name]} />
                </Field>

                <Field data-invalid={!!errors.email}>
                  <FieldLabel htmlFor="resident-email">Email Address</FieldLabel>
                  <Input id="resident-email" type="email" {...register("email")} aria-invalid={!!errors.email} />
                  <FieldError errors={[errors.email]} />
                </Field>

                <Field data-invalid={!!errors.phone}>
                  <FieldLabel htmlFor="resident-phone">Phone Number</FieldLabel>
                  <Input id="resident-phone" type="tel" {...register("phone")} aria-invalid={!!errors.phone} />
                  <FieldError errors={[errors.phone]} />
                </Field>

                <Field data-invalid={!!errors.date_of_birth}>
                  <FieldLabel htmlFor="resident-dob">Date of Birth</FieldLabel>
                  <Input id="resident-dob" type="date" {...register("date_of_birth")} aria-invalid={!!errors.date_of_birth} />
                  <FieldError errors={[errors.date_of_birth]} />
                </Field>

                <Field>
                  <FieldLabel htmlFor="resident-gender">Gender</FieldLabel>
                  <Controller
                    control={control}
                    name="gender"
                    render={({ field }) => (
                      <Select
                        value={field.value || "unset"}
                        onValueChange={(value) => field.onChange(value === "unset" ? "" : value)}
                      >
                        <SelectTrigger id="resident-gender" className="w-full">
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

                <Field className="md:col-span-2" data-invalid={!!errors.profile_picture_url}>
                  <FieldLabel>Profile Photo</FieldLabel>
                  <PhotoPicker
                    value={photoUrl}
                    onChange={(url) => setValue("profile_picture_url", url, { shouldDirty: true })}
                    fallbackText={photoFallback}
                  />
                  <FieldError errors={[errors.profile_picture_url]} />
                </Field>

                <Field className="md:col-span-2" data-invalid={!!errors.address}>
                  <FieldLabel htmlFor="resident-address">Address</FieldLabel>
                  <Textarea id="resident-address" rows={2} {...register("address")} aria-invalid={!!errors.address} />
                  <FieldError errors={[errors.address]} />
                </Field>
              </FieldGroup>
            </section>

            {/* Academic */}
            <section>
              <SectionHeading>Academic Information</SectionHeading>
              <FieldGroup className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field data-invalid={!!errors.student_id}>
                  <FieldLabel htmlFor="resident-student-id">Student ID</FieldLabel>
                  <Input id="resident-student-id" {...register("student_id")} aria-invalid={!!errors.student_id} />
                  <FieldError errors={[errors.student_id]} />
                </Field>

                <Field data-invalid={!!errors.institution}>
                  <FieldLabel htmlFor="resident-institution">Institution</FieldLabel>
                  <Input id="resident-institution" {...register("institution")} aria-invalid={!!errors.institution} />
                  <FieldError errors={[errors.institution]} />
                </Field>

                <Field data-invalid={!!errors.department}>
                  <FieldLabel htmlFor="resident-department">Department</FieldLabel>
                  <Input id="resident-department" {...register("department")} aria-invalid={!!errors.department} />
                  <FieldError errors={[errors.department]} />
                </Field>

                <Field data-invalid={!!errors.program}>
                  <FieldLabel htmlFor="resident-program">Program</FieldLabel>
                  <Input
                    id="resident-program"
                    placeholder="e.g., BS Computer Science"
                    {...register("program")}
                    aria-invalid={!!errors.program}
                  />
                  <FieldError errors={[errors.program]} />
                </Field>

                <Field data-invalid={!!errors.semester}>
                  <FieldLabel htmlFor="resident-semester">Current Semester</FieldLabel>
                  <Input
                    id="resident-semester"
                    placeholder="e.g., 5th Semester"
                    {...register("semester")}
                    aria-invalid={!!errors.semester}
                  />
                  <FieldError errors={[errors.semester]} />
                </Field>
              </FieldGroup>
            </section>

            {/* Guardian */}
            <section>
              <SectionHeading>Guardian Information</SectionHeading>
              <FieldGroup className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field data-invalid={!!errors.guardian_name}>
                  <FieldLabel htmlFor="resident-guardian-name">Guardian Name</FieldLabel>
                  <Input id="resident-guardian-name" {...register("guardian_name")} aria-invalid={!!errors.guardian_name} />
                  <FieldError errors={[errors.guardian_name]} />
                </Field>

                <Field data-invalid={!!errors.guardian_relationship}>
                  <FieldLabel htmlFor="resident-guardian-relationship">Relationship</FieldLabel>
                  <Input
                    id="resident-guardian-relationship"
                    {...register("guardian_relationship")}
                    aria-invalid={!!errors.guardian_relationship}
                  />
                  <FieldError errors={[errors.guardian_relationship]} />
                </Field>

                <Field data-invalid={!!errors.guardian_phone}>
                  <FieldLabel htmlFor="resident-guardian-phone">Guardian Phone</FieldLabel>
                  <Input
                    id="resident-guardian-phone"
                    type="tel"
                    {...register("guardian_phone")}
                    aria-invalid={!!errors.guardian_phone}
                  />
                  <FieldError errors={[errors.guardian_phone]} />
                </Field>

                <Field className="md:col-span-2" data-invalid={!!errors.guardian_address}>
                  <FieldLabel htmlFor="resident-guardian-address">Guardian Address</FieldLabel>
                  <Textarea
                    id="resident-guardian-address"
                    rows={2}
                    {...register("guardian_address")}
                    aria-invalid={!!errors.guardian_address}
                  />
                  <FieldError errors={[errors.guardian_address]} />
                </Field>
              </FieldGroup>
            </section>

            {/* Emergency contact */}
            <section>
              <SectionHeading>Emergency Contact</SectionHeading>
              <FieldGroup className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field data-invalid={!!errors.emergency_contact_name}>
                  <FieldLabel htmlFor="resident-emergency-name">Contact Name</FieldLabel>
                  <Input
                    id="resident-emergency-name"
                    {...register("emergency_contact_name")}
                    aria-invalid={!!errors.emergency_contact_name}
                  />
                  <FieldError errors={[errors.emergency_contact_name]} />
                </Field>

                <Field data-invalid={!!errors.emergency_contact_relationship}>
                  <FieldLabel htmlFor="resident-emergency-relationship">Relationship</FieldLabel>
                  <Input
                    id="resident-emergency-relationship"
                    {...register("emergency_contact_relationship")}
                    aria-invalid={!!errors.emergency_contact_relationship}
                  />
                  <FieldError errors={[errors.emergency_contact_relationship]} />
                </Field>

                <Field data-invalid={!!errors.emergency_contact_phone}>
                  <FieldLabel htmlFor="resident-emergency-phone">Contact Phone</FieldLabel>
                  <Input
                    id="resident-emergency-phone"
                    type="tel"
                    {...register("emergency_contact_phone")}
                    aria-invalid={!!errors.emergency_contact_phone}
                  />
                  <FieldError errors={[errors.emergency_contact_phone]} />
                </Field>
              </FieldGroup>
            </section>

          </div>

          <DialogFooter className="mt-6 shrink-0 border-t border-outline-variant pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>

            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving…" : isEdit ? "Save changes" : "Save Resident"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
