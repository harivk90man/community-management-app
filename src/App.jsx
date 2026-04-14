import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import SignupPage from './pages/SignupPage'
import Dashboard from './pages/Dashboard'
import Villas from './pages/Villas'
import Payments from './pages/Payments'
import Complaints from './pages/Complaints'
import Announcements from './pages/Announcements'
import Documents from './pages/Documents'
import Visitors from './pages/Visitors'
import Vendors from './pages/Vendors'
import EmergencyContacts from './pages/EmergencyContacts'
import Polls from './pages/Polls'
import Expenses from './pages/Expenses'
import DuesConfig from './pages/DuesConfig'
import Analytics from './pages/Analytics'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public */}
          <Route path="/login"  element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />

          {/* Protected — all inside the shell layout */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index              element={<Dashboard />} />
            <Route path="villas"        element={<Villas />} />
            <Route path="payments"      element={<Payments />} />
            <Route path="complaints"    element={<Complaints />} />
            <Route path="announcements" element={<Announcements />} />
            <Route path="documents"     element={<Documents />} />
            <Route path="visitors"      element={<Visitors />} />
            <Route path="vendors"       element={<Vendors />} />
            <Route path="emergency"     element={<EmergencyContacts />} />
            <Route path="polls"         element={<Polls />} />

            {/* Board-only routes */}
            <Route path="expenses"      element={<Expenses />} />
            <Route path="dues-config"   element={<DuesConfig />} />
            <Route path="analytics"     element={<Analytics />} />
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
