import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import Plans from './pages/Plans'
import Config from './pages/Config'
import AgentLogs from './pages/AgentLogs'
import AgentTasks from './pages/AgentTasks'
import Chat from './pages/Chat'
import Layout from './components/Layout'

export const SUPERADMIN = { id: 'superadmin', username: 'SuperAdmin', role: 'superadmin' }

function App(): React.ReactElement {
  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={
            <Layout>
              <Dashboard />
            </Layout>
          }
        />
        <Route
          path="/plans"
          element={
            <Layout>
              <Plans />
            </Layout>
          }
        />
        <Route
          path="/config"
          element={
            <Layout>
              <Config />
            </Layout>
          }
        />
        <Route
          path="/agent-logs"
          element={
            <Layout>
              <AgentLogs />
            </Layout>
          }
        />
        <Route
          path="/agent-tasks"
          element={
            <Layout>
              <AgentTasks />
            </Layout>
          }
        />
        <Route
          path="/chat"
          element={
            <Layout>
              <Chat />
            </Layout>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
