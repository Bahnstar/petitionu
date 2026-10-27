import type { QueryClient } from "@tanstack/react-query"
import {
  buildCSRFHeaders,
  createPetition,
  createClassroomPetition,
  createComment,
  createSignature,
  updatePetition,
  createUpdate,
  closePetition,
  markPetitionVictory,
  type CreatePetitionInput,
  type UpdatePetitionInput,
  type CreateUpdateInput,
} from "../../ash_rpc"

type PetitionTarget = { id: string; classroomId?: string | null }
export type PetitionOwnerCommand =
  | { kind: "edit"; input: UpdatePetitionInput }
  | { kind: "update"; input: Omit<CreateUpdateInput, "petitionId"> }
  | { kind: "close" | "victory" }

type PetitionCommand =
  | { kind: "create"; input: CreatePetitionInput; classroomId?: string | null }
  | ({ petition: PetitionTarget } & (
      | PetitionOwnerCommand
      | { kind: "comment"; text: string }
      | { kind: "sign"; reason: string }
    ))

function failureMessage(command: PetitionCommand) {
  if (command.kind === "create") return "Your petition couldn't be created. Please try again."
  if (command.kind === "comment") return "Your comment couldn't be posted. Please try again."
  if (command.kind === "sign") return "Your signature couldn't be added. Please try again."
  return "Your change couldn't be saved. Please try again."
}

async function execute(command: PetitionCommand) {
  const shared = { fields: ["id"] satisfies ["id"], headers: buildCSRFHeaders() }
  if (command.kind === "create") {
    return command.classroomId
      ? createClassroomPetition({
          ...shared,
          input: { ...command.input, classroomId: command.classroomId },
        })
      : createPetition({ ...shared, input: command.input })
  }
  if (command.kind === "comment")
    return createComment({
      ...shared,
      input: { petitionId: command.petition.id, text: command.text },
    })
  if (command.kind === "sign")
    return createSignature({
      ...shared,
      input: { petitionId: command.petition.id, reason: command.reason.trim() || null },
    })
  if (command.kind === "update")
    return createUpdate({
      ...shared,
      input: { ...command.input, petitionId: command.petition.id },
    })
  const target = { ...shared, identity: command.petition.id }
  if (command.kind === "edit") return updatePetition({ ...target, input: command.input })
  if (command.kind === "close") return closePetition(target)
  return markPetitionVictory(target)
}

// Callers own form state and participation hints; the server remains authoritative.
// Successful writes refresh their projections only. Owner commands wait for refreshed
// detail before closing the form; creation and participation confirm immediately.
export async function mutatePetition(queryClient: QueryClient, command: PetitionCommand) {
  const result = await execute(command).catch((error) => {
    if (command.kind === "create")
      throw new Error("Your petition couldn't be created. Check your connection and try again.")
    throw error
  })
  if (result.success === false) {
    const message =
      command.kind === "comment" || command.kind === "sign"
        ? result.errors[0]?.message
        : result.errors.map((error) => error.message).join(" ")
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
