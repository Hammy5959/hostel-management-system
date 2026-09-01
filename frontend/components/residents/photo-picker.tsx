"use client"

import { useRef, useState } from "react"
import { Camera, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { ApiError, uploadProfilePhoto } from "@/lib/api"

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB, matches backend app/uploads/service.py
const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"]

/** Photo picker for the resident form — opens the device's native file
 * picker, uploads the chosen image to Supabase Storage via the backend
 * relay endpoint, and reports back the resulting public URL. */
export function PhotoPicker({
  value,
  onChange,
  fallbackText,
}: {
  value: string
  onChange: (url: string) => void
  fallbackText: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return

    if (!ACCEPTED_TYPES.includes(file.type)) {
      toast.error("Only PNG, JPEG, WEBP, or GIF images are allowed.")
      return
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error("Image must be 5MB or smaller.")
      return
    }

    setUploading(true)
    try {
      const { url } = await uploadProfilePhoto(file)
      onChange(url)
      toast.success("Photo uploaded.")
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error(err.message)
      } else {
        toast.error("Something went wrong. Please try again.")
      }
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="flex items-center gap-4">
      <Avatar className="size-16 border-2 border-surface-container-low">
        <AvatarImage src={value || undefined} alt="Profile preview" />
        <AvatarFallback className="bg-secondary-container text-base font-bold text-on-secondary-container">
          {fallbackText}
        </AvatarFallback>
      </Avatar>

      <div>
        <Button
          type="button"
          variant="outline"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="gap-2"
        >
          {uploading ? (
            <>
              <Loader2 aria-hidden className="size-4 animate-spin" />
              Uploading…
            </>
          ) : (
            <>
              <Camera aria-hidden className="size-4" />
              Choose Photo
            </>
          )}
        </Button>
       
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  )
}
