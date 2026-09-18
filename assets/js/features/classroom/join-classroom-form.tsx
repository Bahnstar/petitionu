import { useEffect, useRef, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { joinClassroomByCode, buildCSRFHeaders } from "@/js/ash_rpc"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card } from "@/components/ui/card"
import { LogIn, Loader2 } from "lucide-react"

interface JoinClassroomFormProps {
  onSuccess?: () => void
}

export function JoinClassroomForm({ onSuccess }: JoinClassroomFormProps) {
  const [joinCode, setJoinCode] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [joinedName, setJoinedName] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const codeInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (error) codeInput.current?.focus()
  }, [error])

  const joinMutation = useMutation({
    mutationFn: async (code: string) => {
      const result = await joinClassroomByCode({
        input: { joinCode: code },
        fields: ["id", { classroom: ["id", "name"] }],
        headers: buildCSRFHeaders(),
      })

      if (result.success === false) {
        const messages = result.errors.map((error) => error.message).join(" ")
        if (/already|owns this classroom/i.test(messages))
          throw new Error("You already belong to this classroom. Find it in your classroom list.")
        if (/awaiting approval/i.test(messages))
          throw new Error("Your request is awaiting your professor’s approval.")
        if (/removed/i.test(messages))
          throw new Error("Your membership was removed. Contact your professor to rejoin.")
        if (/invalid|archived|unavailable|not found/i.test(messages))
          throw new Error(
            "This code is invalid or the classroom is archived. Ask your professor for a current code.",
          )
        throw new Error("Couldn’t join the classroom. Please try again.")
      }

      return result.data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["myClassrooms"] })
      setJoinCode("")
      setError(null)
      setJoinedName(data.classroom?.name || "your classroom")
      onSuccess?.()
    },
    onError: (err: Error) => {
      setError(err.message)
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (joinMutation.isPending) return
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(joinCode.trim())) {
      setError(
        "Enter a complete join code in UUID format, such as 123e4567-e89b-12d3-a456-426614174000.",
      )
      codeInput.current?.focus()
      return
    }
    setError(null)
    setJoinedName(null)
    joinMutation.mutate(joinCode.trim().toUpperCase())
  }

  return (
    <Card className="gap-0 rounded-2xl border-[#e8d9c3] bg-[#f7e8d2] p-6 shadow-none">
      <h3 className="mb-3 font-display text-3xl font-normal text-foreground">Find your class.</h3>
      <p className="mb-6 text-sm leading-relaxed text-[#685649]">
        Have a code from your professor? You’re one step away from joining the conversation.
      </p>
      <form id="join-classroom-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="join-code">Join code</Label>
          <Input
            id="join-code"
            ref={codeInput}
            aria-required="true"
            type="text"
            placeholder="Enter or paste your code"
            value={joinCode}
            onChange={(e) => {
              setJoinCode(e.target.value)
              setError(null)
              setJoinedName(null)
            }}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            aria-invalid={!!error}
            aria-describedby={error ? "join-code-error" : undefined}
            className="bg-white"
            disabled={joinMutation.isPending}
          />
          {error && (
            <p id="join-code-error" role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>

        <Button type="submit" disabled={joinMutation.isPending} className="w-full">
          {joinMutation.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Joining...
            </>
          ) : (
            <>
              <LogIn className="mr-2 h-4 w-4" />
              Join classroom
            </>
          )}
        </Button>
      </form>
      {joinedName && (
        <p role="status" className="mt-4 text-sm">
          You’ve joined {joinedName}.
        </p>
      )}
    </Card>
  )
}
