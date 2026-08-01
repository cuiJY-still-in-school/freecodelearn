export interface UserInfo {
  id: string
  username: string
  role: string
}

export function getCurrentUser(): UserInfo {
  return { id: 'superadmin', username: 'SuperAdmin', role: 'superadmin' }
}
