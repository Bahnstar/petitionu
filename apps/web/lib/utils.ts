import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const longDate = new Intl.DateTimeFormat(undefined, {
  month: "long",
  day: "numeric",
  year: "numeric",
})

// One date style across the app: "September 24, 2026".
export function formatDate(value: Date | null | undefined) {
  if (!value) return ""
  const time = value.getTime()
  return Number.isFinite(time) ? longDate.format(time) : ""
}

// The noun for a count: plural(1, "member") is "member", plural(2, "member") is "members".
export function plural(count: number, noun: string) {
  return count === 1 ? noun : `${noun}s`
}
