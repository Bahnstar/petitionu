/** A form field's error, shown directly under it. */
export function FieldError({ id, message }: { id: string; message?: string | undefined }) {
  if (!message) return null
  return (
    <p id={id} role="alert" className="text-sm text-destructive">
      {message}
    </p>
  )
}

/** Marks a control invalid and ties it to its `FieldError`, keeping any help text it names. */
export function fieldErrorProps(errorId: string, message?: string, help?: string) {
  const describedBy = [help, message ? errorId : undefined].filter(Boolean).join(" ")
  return {
    "aria-invalid": message ? true : undefined,
    "aria-describedby": describedBy || undefined,
  }
}
