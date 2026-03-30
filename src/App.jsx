import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from '@/contexts/AuthContext'
import { ThemeProvider } from '@/contexts/ThemeContext'
import { ToastProvider } from '@/contexts/ToastContext'
import { ProtectedRoute } from '@/components/Layout'
import Login from '@/pages/Login'
import Dashboard from '@/pages/Dashboard'
import Stands from '@/pages/Stands'
import StandDetail from '@/pages/StandDetail'
import Clients from '@/pages/Clients'
import ClientDetail from '@/pages/ClientDetail'
import Contracts from '@/pages/Contracts'
import ContractDetail from '@/pages/ContractDetail'
import ExpiryAlerts from '@/pages/ExpiryAlerts'
import Reports from '@/pages/Reports'

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <ToastProvider>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route element={<ProtectedRoute />}>
                <Route path="/" element={<Dashboard />} />
                <Route path="/stands" element={<Stands />} />
                <Route path="/stands/:id" element={<StandDetail />} />
                <Route path="/clients" element={<Clients />} />
                <Route path="/clients/:id" element={<ClientDetail />} />
                <Route path="/contracts" element={<Contracts />} />
                <Route path="/contracts/:id" element={<ContractDetail />} />
                <Route path="/expiry-alerts" element={<ExpiryAlerts />} />
                <Route path="/reports" element={<Reports />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </ToastProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  )
}
