import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff, LogIn } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useTheme } from '@/contexts/ThemeContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Sun, Moon } from 'lucide-react'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { signIn } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!email.trim()) { setError('البريد الإلكتروني مطلوب'); return }
    if (!password) { setError('كلمة المرور مطلوبة'); return }
    setLoading(true)
    setError('')
    const { error: err } = await signIn(email, password)
    setLoading(false)
    if (err) {
      setError('البريد الإلكتروني أو كلمة المرور غير صحيحة')
    } else {
      navigate('/')
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -end-40 w-80 h-80 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -bottom-40 -start-40 w-80 h-80 rounded-full bg-accent/5 blur-3xl" />
        <div className="absolute top-1/2 start-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full bg-primary/3 blur-3xl" />
      </div>

      {/* Theme Toggle */}
      <button
        onClick={toggleTheme}
        className="absolute top-4 start-4 p-2 rounded-xl bg-card border border-border text-muted-foreground hover:text-foreground transition-colors shadow-sm"
      >
        {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
      </button>

      <div className="w-full max-w-md animate-fade-in">
        {/* Logo & Branding */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-primary shadow-2xl mb-5 mx-auto">
            <span className="text-4xl font-black text-primary-foreground">V</span>
          </div>
          <h1 className="text-4xl font-black text-foreground tracking-tight">View</h1>
          <p className="text-muted-foreground mt-2 text-sm">نظام إدارة اللوحات الإعلانية</p>
        </div>

        {/* Card */}
        <div className="bg-card border border-border rounded-2xl shadow-xl p-8">
          <h2 className="text-xl font-bold text-foreground mb-1">تسجيل الدخول</h2>
          <p className="text-sm text-muted-foreground mb-6">أدخل بياناتك للوصول إلى لوحة التحكم</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">البريد الإلكتروني</Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@view.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                dir="ltr"
                className="text-start"
                autoComplete="email"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">كلمة المرور</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPass ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  dir="ltr"
                  className="text-start pe-10"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <Button type="submit" className="w-full h-11" disabled={loading}>
              {loading ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                  جاري التحقق...
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <LogIn className="w-4 h-4" />
                  دخول
                </div>
              )}
            </Button>
          </form>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          View Billboard Management System © {new Date().getFullYear()}
        </p>
      </div>
    </div>
  )
}
