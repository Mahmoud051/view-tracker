import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Building2, Users, FileText,
  Bell, BarChart3, LogOut, Sun, Moon, Menu, X, Eye
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useTheme } from '@/contexts/ThemeContext'
import { cn } from '@/lib/utils'
import { Button } from './ui/button'
import { Sheet, SheetContent } from './ui/sheet'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'لوحة التحكم', exact: true },
  { to: '/stands', icon: Building2, label: 'اللوحات الإعلانية' },
  { to: '/clients', icon: Users, label: 'العملاء' },
  { to: '/contracts', icon: FileText, label: 'العقود' },
  { to: '/expiry-alerts', icon: Bell, label: 'تنبيهات الانتهاء' },
  { to: '/reports', icon: BarChart3, label: 'التقارير' },
]

function SidebarContent({ onClose, className }) {
  const { signOut } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  return (
    <div
      className={cn(
        'flex h-full flex-col bg-card text-card-foreground',
        className
      )}
    >
      <div className="flex h-16 items-center justify-between border-b border-border px-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center shadow-lg">
            <Eye className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="text-xl font-black text-foreground tracking-tight">ڤيو</span>
        </div>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground transition-colors lg:hidden"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

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
    </div>
  )
}

export function Sidebar({ open, onClose, className }) {
  return (
    <>
      <aside
        className={cn(
          'hidden lg:flex lg:h-screen lg:w-[var(--sidebar-width)] lg:flex-col lg:border-s lg:border-border lg:bg-card',
          className
        )}
      >
        <SidebarContent />
      </aside>

      <Sheet open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
        <SheetContent side="right" className="w-[var(--sidebar-width)] border-s border-border p-0 sm:max-w-[var(--sidebar-width)]">
          <SidebarContent onClose={onClose} />
        </SheetContent>
      </Sheet>
    </>
  )
}

export function MobileHeader({ onMenuOpen }) {
  return (
    <header className="lg:hidden sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-card px-4 shadow-sm">
      <Button
        onClick={onMenuOpen}
        variant="ghost"
        size="icon-sm"
        className="text-muted-foreground hover:text-foreground"
      >
        <Menu className="w-5 h-5" />
      </Button>
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
          <Eye className="w-4 h-4 text-primary-foreground" />
        </div>
        <span className="font-black text-foreground">ڤيو</span>
      </div>
      <div className="w-8" />
    </header>
  )
}
