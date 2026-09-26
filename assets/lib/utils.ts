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
export function formatDate(value: string | null | undefined) {
  if (!value) return ""
  const time = Date.parse(value)
  return Number.isFinite(time) ? longDate.format(time) : ""
}
