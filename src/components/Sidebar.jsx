import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Building2, Users, FileText,
  Bell, BarChart3, LogOut, Sun, Moon, Menu, X, Eye
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useTheme } from '@/contexts/ThemeContext'
import { cn } from '@/lib/utils'
import { Button } from './ui/button'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'لوحة التحكم', exact: true },
  { to: '/stands', icon: Building2, label: 'اللوحات الإعلانية' },
  { to: '/clients', icon: Users, label: 'العملاء' },
  { to: '/contracts', icon: FileText, label: 'العقود' },
  { to: '/expiry-alerts', icon: Bell, label: 'تنبيهات الانتهاء' },
  { to: '/reports', icon: BarChart3, label: 'التقارير' },
]

export function Sidebar({ open, onClose, className }) {
  const { signOut } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  return (
    <aside
      className={cn(
        'flex flex-col bg-card border-e border-border shadow-2xl transition-transform duration-300 ease-in-out z-50',
        'xl:relative xl:translate-x-0 xl:z-auto xl:shadow-none',
        'fixed top-0 start-0 bottom-0 w-[var(--sidebar-width)]',
        open ? 'translate-x-0' : 'translate-x-full',
        className
      )}
    >
      {/* Logo */}
      <div className="flex items-center justify-between px-6 h-16 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center shadow-lg">
            <Eye className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="text-xl font-black text-foreground tracking-tight">View</span>
        </div>
        <button
          onClick={onClose}
          className="xl:hidden text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {navItems.map(({ to, icon: Icon, label, exact }) => (
          <NavLink
            key={to}
            to={to}
            end={exact}
            onClick={onClose}
            className={({ isActive }) => cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200',
              isActive
                ? 'bg-primary text-primary-foreground shadow-md'
                : 'text-muted-foreground hover:bg-secondary hover:text-secondary-foreground'
            )}
          >
            <Icon className="w-5 h-5 flex-shrink-0" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Bottom actions */}
      <div className="flex-shrink-0 px-3 py-4 border-t border-border space-y-2">
        <button
          onClick={toggleTheme}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-secondary-foreground transition-all duration-200"
        >
          {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          <span>{theme === 'dark' ? 'الوضع النهاري' : 'الوضع الليلي'}</span>
        </button>
        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium text-destructive hover:bg-destructive/10 transition-all duration-200"
        >
          <LogOut className="w-5 h-5" />
          <span>تسجيل الخروج</span>
        </button>
      </div>
    </aside>
  )
}

// Mobile Header
export function MobileHeader({ onMenuOpen }) {
  return (
    <header className="xl:hidden flex items-center justify-between px-4 h-14 bg-card border-b border-border sticky top-0 z-30 shadow-sm">
      <button
        onClick={onMenuOpen}
        className="text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded-lg hover:bg-secondary"
      >
        <Menu className="w-5 h-5" />
      </button>
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
          <Eye className="w-4 h-4 text-primary-foreground" />
        </div>
        <span className="font-black text-foreground">View</span>
      </div>
      <div className="w-8" />
    </header>
  )
}
