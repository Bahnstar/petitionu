export const DEFAULT_PATH = "/ash-typescript" as const

export const ROUTES = {
  home: DEFAULT_PATH,
  petitions: `${DEFAULT_PATH}/petitions`,
  petition: (id: string) => `${DEFAULT_PATH}/petitions/${id}`,
  createPetition: `${DEFAULT_PATH}/create`,
  createPetitionWithClassroom: (classroomId: string) =>
    `${DEFAULT_PATH}/create?classroomId=${classroomId}`,
  dashboard: `${DEFAULT_PATH}/dashboard`,
  classrooms: `${DEFAULT_PATH}/classrooms`,
  classroom: (id: string) => `${DEFAULT_PATH}/classrooms/${id}`,
  classroomNew: `${DEFAULT_PATH}/classrooms/new`,
  classroomEdit: (id: string) => `${DEFAULT_PATH}/classrooms/${id}/edit`,
} as const
