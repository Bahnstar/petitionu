export type PetitionDraft = { title: string; description: string; categoryId: string; goal: string; deadline: string; allowComments: boolean; isAnonymous: boolean }

const emptyDraft: PetitionDraft = { title: "", description: "", categoryId: "", goal: "1000", deadline: "", allowComments: true, isAnonymous: false }
const draftKey = (classroomId: string | null) => `petitionu:petition-draft:v1:${classroomId ?? "public"}`

export function readPetitionDraft(classroomId: string | null): PetitionDraft {
  try {
    const draft: unknown = JSON.parse(sessionStorage.getItem(draftKey(classroomId)) ?? "null")
    if (draft && typeof draft === "object"
      && "title" in draft && typeof draft.title === "string"
      && "description" in draft && typeof draft.description === "string"
      && "categoryId" in draft && typeof draft.categoryId === "string"
      && "goal" in draft && typeof draft.goal === "string") {
      return {
        title: draft.title, description: draft.description, categoryId: draft.categoryId, goal: draft.goal,
        deadline: "deadline" in draft && typeof draft.deadline === "string" ? draft.deadline : "",
        allowComments: "allowComments" in draft && typeof draft.allowComments === "boolean" ? draft.allowComments : true,
        isAnonymous: "isAnonymous" in draft && typeof draft.isAnonymous === "boolean" ? draft.isAnonymous : false,
      }
    }
  } catch { /* Storage may be unavailable or contain an older, invalid draft. */ }
  return emptyDraft
}

export function savePetitionDraft(classroomId: string | null, draft: PetitionDraft) {
  try { sessionStorage.setItem(draftKey(classroomId), JSON.stringify(draft)) } catch { /* Keep the form usable when storage is unavailable. */ }
}

export function clearPetitionDraft(classroomId: string | null) {
  try { sessionStorage.removeItem(draftKey(classroomId)) } catch { /* Storage may be unavailable. */ }
}
