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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["myClassrooms"] })
      setJoinCode("")
      setError(null)
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
    joinMutation.mutate(joinCode.trim())
  }

  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold text-foreground mb-4">Join a Classroom</h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="join-code">Join Code</Label>
          <Input
            id="join-code"
            type="text"
            placeholder="Paste your classroom join code"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            className="font-mono"
            disabled={joinMutation.isPending}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
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
              Join Classroom
            </>
          )}
        </Button>
      </form>
    </Card>
  )
}
