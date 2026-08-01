import { createContext, useContext } from 'react'

export interface UserCtx {
  role: string   // 'student' | 'teacher' | 'admin' | 'user'
  userId: string
}

export const UserContext = createContext<UserCtx>({ role: 'user', userId: '' })
export const useUser = () => useContext(UserContext)
