import { createContext, useContext, useState, useCallback } from 'react'
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react'
import { cn } from '@/lib/utils'

const ToastContext = createContext({})

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const toast = useCallback(({ title, description, variant = 'default', duration = 4000 }) => {
    const id = Date.now() + Math.random()
    setToasts(prev => [...prev, { id, title, description, variant }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, duration)
  }, [])

  const dismiss = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const icons = {
    default: <Info className="w-5 h-5 text-primary" />,
    success: <CheckCircle className="w-5 h-5 text-success" />,
    error: <XCircle className="w-5 h-5 text-destructive" />,
    warning: <AlertTriangle className="w-5 h-5 text-warning" />,
  }

  const variantClasses = {
    default: 'border-border bg-card',
    success: 'border-success/30 bg-success/10',
    error: 'border-destructive/30 bg-destructive/10',
    warning: 'border-warning/30 bg-warning/10',
  }

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* Toast Container */}
      <div className="fixed bottom-4 start-4 z-[100] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
        {toasts.map(t => (
          <div
            key={t.id}
            className={cn(
              'flex items-start gap-3 p-4 rounded-xl border shadow-lg pointer-events-auto',
              'animate-slide-in backdrop-blur-sm',
              variantClasses[t.variant] || variantClasses.default
            )}
          >
            <div className="flex-shrink-0 mt-0.5">{icons[t.variant] || icons.default}</div>
            <div className="flex-1 min-w-0">
              {t.title && <p className="font-semibold text-sm text-foreground">{t.title}</p>}
              {t.description && <p className="text-sm text-muted-foreground mt-0.5">{t.description}</p>}
            </div>
            <button
              onClick={() => dismiss(t.id)}
              className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)
