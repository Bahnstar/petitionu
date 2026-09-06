export type RpcField = string | { [relationship: string]: RpcField[] }

export function isPrimitiveField(field: RpcField): field is string {
  return typeof field === "string"
}
