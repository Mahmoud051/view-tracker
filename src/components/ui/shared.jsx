import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog'
import { cn, statusLabels } from '@/lib/utils'
import { Button } from './button'
import { Badge } from './badge'

// ---- ConfirmDialog ----
export function ConfirmDialog({ open, onOpenChange, title, description, confirmText = 'تأكيد', cancelText = 'إلغاء', onConfirm, variant = 'destructive' }) {
  return (
    <AlertDialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialogPrimitive.Portal>
        <AlertDialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <AlertDialogPrimitive.Content
          className={cn(
            'fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%]',
            'w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl p-6',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
          )}
        >
          <AlertDialogPrimitive.Title className="text-lg font-bold text-foreground mb-2">
            {title}
          </AlertDialogPrimitive.Title>
          <AlertDialogPrimitive.Description className="text-sm text-muted-foreground mb-6">
            {description}
          </AlertDialogPrimitive.Description>
          <div className="flex gap-3 justify-end">
            <AlertDialogPrimitive.Cancel asChild>
              <Button variant="outline">{cancelText}</Button>
            </AlertDialogPrimitive.Cancel>
            <AlertDialogPrimitive.Action asChild>
              <Button variant={variant} onClick={onConfirm}>{confirmText}</Button>
            </AlertDialogPrimitive.Action>
          </div>
        </AlertDialogPrimitive.Content>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  )
}

// ---- StatusBadge ----
const statusVariantMap = {
  active: 'success',
  expired: 'destructive',
  upcoming: 'info',
  terminated: 'muted',
  renewal_pending: 'warning',
  available: 'success',
  rented: 'info',
  inactive: 'muted',
}

export function StatusBadge({ status, className }) {
  const variant = statusVariantMap[status] || 'outline'
  const label = statusLabels[status] || status
  return (
    <Badge variant={variant} className={className}>
      {label}
    </Badge>
  )
}

// ---- FormField ----
export function FormField({ label, error, required, children, className }) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && (
        <label className="text-sm font-medium text-foreground">
          {label}
          {required && <span className="text-destructive me-1"> *</span>}
        </label>
      )}
      {children}
      {error && <p className="text-xs text-destructive mt-0.5">{error}</p>}
    </div>
  )
}

// ---- PageHeader ----
export function PageHeader({ title, description, children }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{title}</h1>
        {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
      </div>
      {children && <div className="flex items-center gap-2 flex-wrap">{children}</div>}
    </div>
  )
}

// ---- EmptyState ----
export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      {Icon && (
        <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
          <Icon className="w-8 h-8 text-muted-foreground" />
        </div>
      )}
      <h3 className="text-lg font-semibold text-foreground mb-2">{title}</h3>
      {description && <p className="text-sm text-muted-foreground mb-4 max-w-xs">{description}</p>}
      {action}
    </div>
  )
}

// ---- LoadingScreen ----
export function LoadingScreen() {
  return (
    <div className="flex items-center justify-center min-h-[300px]">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 rounded-full border-4 border-border border-t-primary animate-spin" />
        <p className="text-sm text-muted-foreground">جاري التحميل...</p>
      </div>
    </div>
  )
}

// ---- StatCard ----
export function StatCard({ title, value, icon: Icon, description, variant = 'default', className }) {
  const variants = {
    default: 'from-primary/10 to-primary/5 border-primary/20',
    success: 'from-success/10 to-success/5 border-success/20',
    warning: 'from-warning/10 to-warning/5 border-warning/20',
    danger: 'from-destructive/10 to-destructive/5 border-destructive/20',
    info: 'from-info/10 to-info/5 border-info/20',
  }
  const iconVariants = {
    default: 'bg-primary/20 text-primary',
    success: 'bg-success/20 text-success',
    warning: 'bg-warning/20 text-warning',
    danger: 'bg-destructive/20 text-destructive',
    info: 'bg-info/20 text-info',
  }
  return (
    <div className={cn(
      'rounded-2xl border bg-gradient-to-br p-5 flex flex-row-reverse items-start gap-4 card-hover',
      variants[variant] || variants.default,
      className
    )}>
      {Icon && (
        <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0', iconVariants[variant] || iconVariants.default)}>
          <Icon className="w-6 h-6" />
        </div>
      )}
      <div className="flex-1 min-w-0 text-right">
        <p className="text-sm font-medium text-muted-foreground truncate">{title}</p>
        <p className="text-2xl font-bold text-foreground mt-1">{value}</p>
        {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
      </div>
    </div>
  )
}
