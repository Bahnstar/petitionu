import { useState } from "react"
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

  const joinMutation = useMutation({
    mutationFn: async (code: string) => {
      const result = await joinClassroomByCode({
        input: { joinCode: code },
        fields: ["id", { classroom: ["id", "name"] }],
        headers: buildCSRFHeaders(),
      })

      if (result.success === false) {
        throw new Error(result.errors[0]?.message || "Failed to join classroom")
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
    if (!joinCode.trim()) {
      setError("Please enter a join code")
      return
    }
    setError(null)
    setJoinedName(null)
    joinMutation.mutate(joinCode.trim())
  }

  return (
    <Card className="gap-0 rounded-2xl border-[#e8d9c3] bg-[#f7e8d2] p-6 shadow-none">
      <h3 className="font-display text-3xl font-normal text-foreground mb-3">Find your class.</h3>
      <p className="mb-6 text-sm leading-relaxed text-[#685649]">Have a code from your professor? You’re one step away from joining the conversation.</p>
      <form id="join-classroom-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="join-code">Join code</Label>
          <Input
            id="join-code"
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
          {error && <p id="join-code-error" role="alert" className="text-sm text-destructive">{error}</p>}
        </div>

        <Button type="submit" disabled={joinMutation.isPending} className="w-full">
          {joinMutation.isPending ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Joining...
            </>
          ) : (
            <>
              <LogIn className="w-4 h-4 mr-2" />
              Join classroom
            </>
          )}
        </Button>
      </form>
      {joinedName && <p role="status" className="mt-4 text-sm">You’ve joined {joinedName}.</p>}
    </Card>
  )
}
