export type User = { id: string; email: string; createdAt: string }

export type Project = { id: string; name: string; createdAt: string; updatedAt: string }

export type DesignFile = {
  id: string
  projectId: string
  name: string
  revision: number
  contentSize: number
  createdAt: string
  updatedAt: string
}

export type AuthResponse = { user: User }
export type FileListResponse = { files: DesignFile[] }
export type FileResponse = { file: DesignFile }
export type FileContentResponse<T = unknown> = { file: DesignFile; document: T }
export type ProjectListResponse = { projects: Project[] }
export type ProjectResponse = { project: Project }
export type AiEditRequest = {
  instruction: string
  targetId: string
  context: unknown
}
export type AiEditResponse = {
  summary: string
  elements: unknown[]
}
export type ApiError = { error: { code: string; message: string } }
