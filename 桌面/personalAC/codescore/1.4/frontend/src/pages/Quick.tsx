import React from 'react'
import Chat from './Chat'

export default function Quick(): React.ReactElement {
  return (
    <div style={{ height: '100vh', background: 'var(--bg)' }}>
      <Chat minimal={true} />
    </div>
  )
}
