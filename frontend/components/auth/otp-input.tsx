"use client"

import { useRef } from "react"
import { cn } from "@/lib/utils"

const LENGTH = 6

interface OtpInputProps {
  value: string
  onChange: (value: string) => void
  error?: boolean
  disabled?: boolean
}

export function OtpInput({
  value,
  onChange,
  error,
  disabled,
}: OtpInputProps) {
  const inputs = useRef<(HTMLInputElement | null)[]>([])

  const digits = Array.from(
    { length: LENGTH },
    (_, i) => value[i] ?? "",
  )

  function focusAt(index: number) {
    if (index >= 0 && index < LENGTH) {
      inputs.current[index]?.focus()
      inputs.current[index]?.select()
    }
  }

  function handleChange(index: number, raw: string) {
    const cleaned = raw.replace(/\D/g, "")

    if (!cleaned) {
      const next = value.split("")
      next[index] = ""
      onChange(next.join(""))
      return
    }

    const next = value.split("")

    // Normal single digit input
    next[index] = cleaned[cleaned.length - 1]

    onChange(next.join(""))

    // Multiple digits = paste/autofill
    if (cleaned.length > 1) {
      const filled = Array.from(
        { length: LENGTH },
        (_, i) => (i < index ? value[i] ?? "" : ""),
      )

      cleaned.split("").forEach((digit, offset) => {
        const target = index + offset

        if (target < LENGTH) {
          filled[target] = digit
        }
      })

      onChange(filled.join(""))

      focusAt(
        Math.min(index + cleaned.length, LENGTH - 1),
      )
    } else {
      focusAt(index + 1)
    }
  }

  function handleKeyDown(
    index: number,
    e: React.KeyboardEvent<HTMLInputElement>,
  ) {
    if (e.key === "Backspace") {
      e.preventDefault()

      const next = value.split("")

      // If current digit has a value, delete it first.
      if (value[index]) {
        next[index] = ""
        onChange(next.join(""))
        focusAt(index)
        return
      }

      // If current digit is already empty,
      // move to previous digit and delete it.
      if (index > 0) {
        next[index - 1] = ""
        onChange(next.join(""))
        focusAt(index - 1)
      }

      return
    }

    if (e.key === "Delete") {
      e.preventDefault()

      const next = value.split("")
      next[index] = ""
      onChange(next.join(""))
      focusAt(index)

      return
    }

    if (e.key === "ArrowLeft" && index > 0) {
      e.preventDefault()
      focusAt(index - 1)
      return
    }

    if (e.key === "ArrowRight" && index < LENGTH - 1) {
      e.preventDefault()
      focusAt(index + 1)
    }
  }

  function handlePaste(
    index: number,
    e: React.ClipboardEvent<HTMLInputElement>,
  ) {
    e.preventDefault()

    const pasted = e.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, LENGTH)

    if (!pasted) return

    const filled = Array.from(
      { length: LENGTH },
      (_, i) => (i < index ? value[i] ?? "" : ""),
    )

    pasted.split("").forEach((digit, offset) => {
      const target = index + offset

      if (target < LENGTH) {
        filled[target] = digit
      }
    })

    onChange(filled.join(""))

    focusAt(
      Math.min(index + pasted.length, LENGTH - 1),
    )
  }

  return (
    <div
      className="flex justify-between gap-2 sm:gap-4"
      role="group"
      aria-label="6-digit verification code"
    >
      {digits.map((digit, i) => (
        <input
          key={i}
          ref={(el) => {
            inputs.current[i] = el
          }}
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          maxLength={1}
          aria-label={`Digit ${i + 1}`}
          value={digit}
          disabled={disabled}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={(e) => handlePaste(i, e)}
          className={cn(
            "h-14 w-12 rounded-lg border bg-surface text-center text-2xl font-semibold tabular-nums text-on-surface transition-all outline-none sm:h-16 sm:w-14",
            error
              ? "border-destructive focus:border-destructive focus:ring-2 focus:ring-destructive/20"
              : "border-outline-variant focus:border-primary focus:ring-2 focus:ring-primary/20",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
        />
      ))}
    </div>
  )
}