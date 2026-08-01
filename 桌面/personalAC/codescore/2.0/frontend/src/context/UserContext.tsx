import { createContext, useContext } from 'react'

export interface User {
  id: string
  username: string
  display_name: string | null
  role: 'guardian' | 'student'
  student_grade: string | null
  guardian_id: string | null
  sync_token: string
}

interface UserContextValue {
  user: User | null
  setUser: (u: User | null) => void
}

export const UserContext = createContext<UserContextValue>({
  user: null,
  setUser: () => {},
})

export const useUser = () => useContext(UserContext)
