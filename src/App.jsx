import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ThemeProvider } from './contexts/ThemeContext'
import { AuthProvider } from './contexts/AuthContext'
import { RealtimeProvider } from './contexts/RealtimeContext'
import ProtectedRoute from './components/ProtectedRoute'
import ToastContainer from './components/ToastContainer'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import SignupPage from './pages/SignupPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import ChangePasswordPage from './pages/ChangePasswordPage'
import Dashboard from './pages/Dashboard'
import Villas from './pages/Villas'
import Payments from './pages/Payments'
import Complaints from './pages/Complaints'
import Announcements from './pages/Announcements'
import BoardMembers from './pages/BoardMembers'
import Documents from './pages/Documents'
import Vendors from './pages/Vendors'
import Polls from './pages/Polls'
import Expenses from './pages/Expenses'
import DuesConfig from './pages/DuesConfig'
import Analytics from './pages/Analytics'
import Calendar from './pages/Calendar'
import Reports from './pages/Reports'

export default function App() {
  return (
    <ThemeProvider>
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public */}
          <Route path="/login"           element={<LoginPage />} />
          <Route path="/signup"          element={<SignupPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password"  element={<ResetPasswordPage />} />

          {/* Protected — force password change (no layout) */}
          <Route path="/change-password" element={
            <ProtectedRoute><ChangePasswordPage /></ProtectedRoute>
          } />

          {/* Protected — all inside the shell layout */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <RealtimeProvider>
                  <ToastContainer />
                  <Layout />
                </RealtimeProvider>
              </ProtectedRoute>
            }
          >
            <Route index              element={<Dashboard />} />
            <Route path="villas"        element={<Villas />} />
            <Route path="payments"      element={<Payments />} />
            <Route path="complaints"    element={<Complaints />} />
            <Route path="announcements"  element={<Announcements />} />
            <Route path="board-members" element={<BoardMembers />} />
            <Route path="documents"     element={<Documents />} />
            <Route path="vendors"       element={<Vendors />} />
            <Route path="polls"         element={<Polls />} />
            <Route path="analytics"     element={<Analytics />} />
            <Route path="reports"       element={<Reports />} />
            <Route path="calendar"      element={<Calendar />} />

            {/* Board-only routes */}
            <Route path="expenses"      element={<Expenses />} />
            <Route path="dues-config"   element={<DuesConfig />} />
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
    </ThemeProvider>
  )
}
