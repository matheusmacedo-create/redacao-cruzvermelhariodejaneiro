export function privateAvatarUrl(path?: string | null) {
  return path ? `/api/private-blob?pathname=${encodeURIComponent(path)}` : null
}
