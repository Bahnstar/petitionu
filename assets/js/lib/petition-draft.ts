export type PetitionDraft = {
  title: string
  description: string
  categoryId: string
  goal: string
  deadline: string
  allowComments: boolean
  isAnonymous: boolean
}

const emptyDraft: PetitionDraft = {
  title: "",
  description: "",
  categoryId: "",
  goal: "1000",
  deadline: "",
  allowComments: true,
  isAnonymous: false,
}
const draftKey = (classroomId: string | null) =>
  `petitionu:petition-draft:v1:${classroomId ?? "public"}`

function isPetitionDraft(
  value: unknown,
): value is Pick<PetitionDraft, "title" | "description" | "categoryId" | "goal"> {
  return (
    value !== null &&
    typeof value === "object" &&
    "title" in value &&
    typeof value.title === "string" &&
    "description" in value &&
    typeof value.description === "string" &&
    "categoryId" in value &&
    typeof value.categoryId === "string" &&
    "goal" in value &&
    typeof value.goal === "string"
  )
}

function isString(value: unknown): value is string {
  return typeof value === "string"
}
function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean"
}

export function readPetitionDraft(classroomId: string | null): PetitionDraft {
  try {
    const draft: unknown = JSON.parse(sessionStorage.getItem(draftKey(classroomId)) ?? "null")
    if (isPetitionDraft(draft)) {
      return {
        title: draft.title,
        description: draft.description,
        categoryId: draft.categoryId,
        goal: draft.goal,
        deadline: "deadline" in draft && isString(draft.deadline) ? draft.deadline : "",
        allowComments:
          "allowComments" in draft && isBoolean(draft.allowComments) ? draft.allowComments : true,
        isAnonymous:
          "isAnonymous" in draft && isBoolean(draft.isAnonymous) ? draft.isAnonymous : false,
      }
    }
  } catch {
    /* Storage may be unavailable or contain an older, invalid draft. */
  }
  return emptyDraft
}

export function savePetitionDraft(classroomId: string | null, draft: PetitionDraft) {
  try {
    sessionStorage.setItem(draftKey(classroomId), JSON.stringify(draft))
  } catch {
    /* Keep the form usable when storage is unavailable. */
  }
}

export function clearPetitionDraft(classroomId: string | null) {
  try {
    sessionStorage.removeItem(draftKey(classroomId))
  } catch {
    /* Storage may be unavailable. */
  }
}
