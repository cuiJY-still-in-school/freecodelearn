import React from 'react'
import Chat from './Chat'

// 学生登录后看到的唯一界面：全屏无侧边栏聊天
export default function StudentChat(): React.ReactElement {
  return (
    <div style={{ height: '100vh', background: 'var(--bg)' }}>
      <Chat minimal={true} />
    </div>
  )
}
