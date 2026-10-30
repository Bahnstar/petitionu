import type { QueryClient } from "@tanstack/react-query"
import type { CreatePetitionInput, PetitionInput } from "@petitionu/domain"
import { api } from "@/lib/api"

type PetitionTarget = { id: string; classroomId?: string | null }
export type PetitionOwnerCommand =
  | { kind: "edit"; input: PetitionInput }
  | { kind: "update"; input: { title: string; body: string } }
  | { kind: "close" | "victory" }

type PetitionCommand =
  | { kind: "create"; input: CreatePetitionInput; classroomId?: string | null }
  | ({ petition: PetitionTarget } & (
      | PetitionOwnerCommand
      | { kind: "comment"; text: string }
      | { kind: "sign"; reason: string }
      | { kind: "withdraw" }
      | { kind: "editComment"; commentId: string; text: string }
      | { kind: "deleteComment"; commentId: string }
    ))

function failureMessage(command: PetitionCommand) {
  if (command.kind === "create")
    return "Your petition couldn't be created. Check your connection and try again."
  if (command.kind === "comment") return "Your comment couldn't be posted. Please try again."
  if (command.kind === "sign") return "Your signature couldn't be added. Please try again."
  if (command.kind === "withdraw") return "Your signature couldn't be withdrawn. Please try again."
  return "Your change couldn't be saved. Please try again."
}

function execute(command: PetitionCommand) {
  if (command.kind === "create") {
    return command.classroomId
      ? api.createClassroomPetition({ ...command.input, classroomId: command.classroomId })
      : api.createPetition(command.input)
  }
  const petitionId = command.petition.id
  if (command.kind === "comment") return api.createComment({ petitionId, text: command.text })
  if (command.kind === "sign")
    return api.createSignature({ petitionId, reason: command.reason.trim() || null })
  if (command.kind === "withdraw") return api.deleteSignature({ petitionId })
  if (command.kind === "editComment")
    return api.updateComment({ id: command.commentId, text: command.text })
  if (command.kind === "deleteComment") return api.deleteComment({ id: command.commentId })
  if (command.kind === "update") return api.createUpdate({ ...command.input, petitionId })
  if (command.kind === "edit") return api.updatePetition({ ...command.input, id: petitionId })
  if (command.kind === "close") return api.closePetition({ id: petitionId })
  return api.markPetitionVictory({ id: petitionId })
}

// Participation shows one message: the first reason the server gave.
const singleMessage = new Set<PetitionCommand["kind"]>([
  "comment",
  "editComment",
  "deleteComment",
  "sign",
  "withdraw",
])

// Callers own form state and participation hints; the server remains authoritative.
// Successful writes refresh their projections only. Owner commands, withdrawals and comment
// edits wait for refreshed detail (the page would otherwise show the stale signature or
// comment); creation, signing and commenting confirm immediately.
export function mutatePetition(
  queryClient: QueryClient,
  command: Extract<PetitionCommand, { kind: "create" }>,
): Promise<{ readonly id: string }>
export function mutatePetition(queryClient: QueryClient, command: PetitionCommand): Promise<void>
export async function mutatePetition(
  queryClient: QueryClient,
  command: PetitionCommand,
): Promise<{ readonly id: string } | void> {
  const result = await execute(command)
  if (result.success === false) {
    // `unknown` errors are transport failures or unexpected responses; their text isn't for users.
    const errors = result.errors.filter((error) => error.type !== "unknown")
    const message = singleMessage.has(command.kind)
      ? errors[0]?.message
      : errors.map((error) => error.message).join(" ")
    throw new Error(message || failureMessage(command))
  }

  const keys: string[][] = [["petitions"], ["dashboardUser"]]
  const classroomId = command.kind === "create" ? command.classroomId : command.petition.classroomId
  if (command.kind !== "create") keys.push(["petition", command.petition.id])
  if (classroomId) {
    keys.push(["classroomPetitions", classroomId])
    if (command.kind === "create") keys.push(["classroom", classroomId], ["myClassrooms"])
  }
  const refresh = Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })))
  if (command.kind === "create" || command.kind === "comment" || command.kind === "sign") {
    void refresh
  } else {
    await refresh
  }
  return result.data
}
