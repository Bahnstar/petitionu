import { useEffect, type RefObject } from "react"

/** Moves focus to the form's first invalid control when a submission fails. */
export function useFocusFirstInvalid(form: RefObject<HTMLFormElement | null>, error: Error | null) {
  useEffect(() => {
    if (error) form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [form, error])
}
