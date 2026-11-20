import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * An on/off switch: a native checkbox announced as a switch, drawn as a track and thumb. Give it
 * an `id` for its `Label` and an `aria-describedby` for its help text.
 */
function Switch({ className, ...props }: Omit<React.ComponentProps<"input">, "type" | "role">) {
  return (
    <span data-slot="switch" className={cn("relative inline-flex h-6 w-11 shrink-0", className)}>
      <input
        type="checkbox"
        role="switch"
        aria-checked={props.checked}
        className="peer absolute inset-0 z-10 m-0 size-full cursor-pointer appearance-none rounded-full opacity-0 disabled:cursor-not-allowed"
        {...props}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none size-full rounded-full bg-muted-foreground/60 transition-colors peer-checked:bg-primary peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/50 peer-disabled:opacity-50 motion-reduce:transition-none"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-5 peer-disabled:opacity-80 motion-reduce:transition-none"
      />
    </span>
  )
}

export { Switch }
