"use client"

import { useState } from "react"
import { Eye, EyeOff } from "lucide-react"

import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

interface PasswordInputProps
  extends Omit<React.ComponentProps<typeof Input>, "type"> {
  /** Optional icon rendered on the left (e.g. Lock), mirroring the email field's icon slot. */
  leftIcon?: React.ReactNode
}

/**
 * Password input with a show/hide toggle. Hidden by default; clicking the
 * eye/eye-off button switches between masked and plain text.
 */
export function PasswordInput({
  className,
  leftIcon,
  ...props
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false)

  return (
    <div className="relative">
      {leftIcon && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 ml-3.5 flex items-center"
        >
          {leftIcon}
        </span>
      )}
      <Input
        type={visible ? "text" : "password"}
        className={cn(leftIcon ? "pl-10" : "pl-3.5", "pr-12", className)}
        {...props}
      />
      <button
        type="button"
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        onClick={() => setVisible((v) => !v)}
        className="absolute inset-y-0 right-0 my-auto mr-2 flex size-8 items-center justify-center rounded-md text-on-surface-variant transition-colors hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        {visible ? (
          <EyeOff aria-hidden className="size-5" />
        ) : (
          <Eye aria-hidden className="size-5" />
        )}
      </button>
    </div>
  )
}
