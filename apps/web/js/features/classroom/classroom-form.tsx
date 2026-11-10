import { useEffect, useRef, useState, type ReactNode } from "react"
import { useMutation } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"
import {
  classroomDescriptionMaxLength,
  classroomNameMaxLength,
  type ClassroomDto,
} from "@petitionu/domain"
import { Button } from "@/components/ui/button"
import { FieldError, fieldErrorProps } from "@/components/ui/field-error"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { formErrors } from "@/lib/form-errors"
import { cn } from "@/lib/utils"
import { useFocusFirstInvalid } from "../../hooks/use-focus-first-invalid"

export interface ClassroomFormValues {
  readonly name: string
  readonly description: string
  readonly allowStudentPetitions: boolean
}

/** What a save sends: the values trimmed, with a blank description as `null`. */
export interface ClassroomFormPayload {
  readonly name: string
  readonly description: string | null
  readonly allowStudentPetitions: boolean
}

type Field = "name" | "description" | "allowStudentPetitions"
const fields: ReadonlyArray<Field> = ["name", "description", "allowStudentPetitions"]

interface ClassroomFormProps {
  /** The form element's id. */
  readonly id: string
  readonly initial: ClassroomFormValues
  /** Sends the values; throws `ApiError` (`serverError`) when the server refuses them. */
  readonly save: (payload: ClassroomFormPayload) => Promise<ClassroomDto>
  readonly onSaved: (classroom: ClassroomDto) => void
  readonly onCancel: () => void
  readonly submitLabel: string
  readonly pendingLabel: string
  /** Shown above the buttons. */
  readonly footnote?: ReactNode
}

/** A character count against the domain's limit, which turns red once the text is over it. */
function CharacterCount({ id, value, max }: { id: string; value: string; max: number }) {
  // The schemas count the trimmed text.
  const length = value.trim().length
  const over = length > max
  return (
    <p
      id={id}
      className={cn(
        "shrink-0 text-right text-xs whitespace-nowrap tabular-nums",
        over ? "font-medium text-destructive" : "text-muted-foreground",
      )}
    >
      <span className="sr-only">{over ? "Too long: " : "Characters used: "}</span>
      {length.toLocaleString()} / {max.toLocaleString()}
    </p>
  )
}

/** The classroom's name, description and petition setting, for creating and editing it. */
export function ClassroomForm({
  id,
  initial,
  save,
  onSaved,
  onCancel,
  submitLabel,
  pendingLabel,
  footnote,
}: ClassroomFormProps) {
  const [values, setValues] = useState(initial)
  const [errors, setErrors] = useState<Partial<Record<Field | "general", string>>>({})
  const form = useRef<HTMLFormElement>(null)
  const nameInput = useRef<HTMLInputElement>(null)
  const errorSummary = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (errors.general) errorSummary.current?.focus()
  }, [errors.general])

  const mutation = useMutation({
    mutationFn: () =>
      save({
        name: values.name.trim(),
        description: values.description.trim() || null,
        allowStudentPetitions: values.allowStudentPetitions,
      }),
    onSuccess: onSaved,
    onError: (err: Error) => {
      const { fields: fieldMessages, summary } = formErrors(err, fields)
      setErrors({ ...fieldMessages, general: summary ?? "" })
    },
  })
  useFocusFirstInvalid(form, mutation.error)
  const pending = mutation.isPending

  const change = <K extends Field>(field: K, value: ClassroomFormValues[K]) => {
    setValues((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: "" }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (pending) return
    if (!values.name.trim()) {
      setErrors({ name: "Classroom name is required" })
      nameInput.current?.focus()
      return
    }
    setErrors({})
    mutation.mutate()
  }

  return (
    <form
      id={id}
      ref={form}
      onSubmit={handleSubmit}
      className="space-y-7"
      aria-busy={pending || undefined}
    >
      {errors.general && (
        <div
          ref={errorSummary}
          tabIndex={-1}
          role="alert"
          className="rounded-lg border border-destructive/20 bg-destructive/10 p-4"
        >
          <p className="text-sm text-destructive">{errors.general}</p>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="name">
          Classroom name <span className="text-muted-foreground">(required)</span>
        </Label>
        <Input
          id="name"
          ref={nameInput}
          aria-required="true"
          type="text"
          autoComplete="off"
          placeholder="e.g., Introduction to Political Science"
          {...fieldErrorProps("classroom-name-error", errors.name, "classroom-name-count")}
          value={values.name}
          onChange={(e) => change("name", e.target.value)}
          disabled={pending}
        />
        <div className="flex items-start justify-between gap-4">
          <FieldError id="classroom-name-error" message={errors.name} />
          <div className="ml-auto">
            <CharacterCount
              id="classroom-name-count"
              value={values.name}
              max={classroomNameMaxLength}
            />
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">
          Description <span className="text-muted-foreground">(optional)</span>
        </Label>
        <Textarea
          id="description"
          placeholder="What will your class explore together?"
          value={values.description}
          onChange={(e) => change("description", e.target.value)}
          rows={4}
          disabled={pending}
          {...fieldErrorProps(
            "classroom-description-error",
            errors.description,
            "classroom-description-help classroom-description-count",
          )}
        />
        <FieldError id="classroom-description-error" message={errors.description} />
        <div className="flex items-start justify-between gap-4">
          <p id="classroom-description-help" className="text-xs text-muted-foreground">
            Students will see this when they join your classroom.
          </p>
          <CharacterCount
            id="classroom-description-count"
            value={values.description}
            max={classroomDescriptionMaxLength}
          />
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-start justify-between gap-4 rounded-xl bg-muted/60 p-4">
          <div className="space-y-1.5">
            <Label htmlFor="allowStudentPetitions" className="cursor-pointer leading-snug">
              Students may create petitions
            </Label>
            <p
              id="allow-student-petitions-help"
              className="text-xs leading-relaxed text-muted-foreground"
            >
              When off, only you can start petitions in this classroom.
            </p>
          </div>
          <Switch
            id="allowStudentPetitions"
            className="mt-0.5"
            checked={values.allowStudentPetitions}
            onChange={(e) => change("allowStudentPetitions", e.target.checked)}
            disabled={pending}
            {...fieldErrorProps(
              "allow-student-petitions-error",
              errors.allowStudentPetitions,
              "allow-student-petitions-help",
            )}
          />
        </div>
        <FieldError id="allow-student-petitions-error" message={errors.allowStudentPetitions} />
      </div>

      {footnote && <p className="text-sm text-muted-foreground">{footnote}</p>}
      <div className="flex flex-wrap justify-end gap-3 border-t border-border pt-6">
        <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              {pendingLabel}
            </>
          ) : (
            submitLabel
          )}
        </Button>
      </div>
    </form>
  )
}
