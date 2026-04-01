// Textarea
import { forwardRef, useEffect, useRef } from 'react'
import * as TabsPrimitive from '@radix-ui/react-tabs'
import * as SeparatorPrimitive from '@radix-ui/react-separator'
import { cn } from '@/lib/utils'

// ---- DateInput ----
export { DateInput } from './date-input'

// ---- Textarea ----
export const Textarea = forwardRef(({ className, ...props }, ref) => (
  <textarea
    className={cn(
      'flex min-h-[80px] w-full rounded-lg border border-input bg-background px-3 py-2 text-sm',
      'ring-offset-background placeholder:text-muted-foreground resize-none',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
      'disabled:cursor-not-allowed disabled:opacity-50 transition-colors duration-200',
      className
    )}
    ref={ref}
    {...props}
  />
))
Textarea.displayName = 'Textarea'

// ---- Table ----
export function Table({ className, ...props }) {
  return (
    <div className="relative w-full overflow-auto" dir="rtl">
      <table className={cn('w-full caption-bottom text-sm', className)} {...props} />
    </div>
  )
}
export function TableHeader({ className, ...props }) {
  return <thead className={cn('[&_tr]:border-b [&_tr]:border-border', className)} {...props} />
}
export function TableBody({ className, ...props }) {
  return <tbody className={cn('[&_tr:last-child]:border-0', className)} {...props} />
}
export function TableFooter({ className, ...props }) {
  return (
    <tfoot
      className={cn('border-t border-border bg-muted/50 font-medium [&>tr]:last:border-b-0', className)}
      {...props}
    />
  )
}
export function TableRow({ className, ...props }) {
  return (
    <tr
      className={cn(
        'border-b border-border transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted',
        className
      )}
      {...props}
    />
  )
}
export function TableHead({ className, ...props }) {
  return (
    <th
      className={cn(
        'h-12 px-4 text-start align-middle font-semibold text-muted-foreground text-xs uppercase tracking-wider',
        className
      )}
      {...props}
    />
  )
}
export function TableCell({ className, ...props }) {
  return (
    <td className={cn('px-4 py-3 align-middle text-sm', className)} {...props} />
  )
}
export function TableCaption({ className, ...props }) {
  return (
    <caption className={cn('mt-4 text-sm text-muted-foreground', className)} {...props} />
  )
}

// ---- Tabs ----
export function Tabs({ className, ...props }) {
  const ref = useRef(null)
  useEffect(() => {
    if (ref.current) ref.current.dir = 'rtl'
  }, [])
  return <TabsPrimitive.Root ref={ref} dir="rtl" {...props} className={cn(className)} />
}
export function TabsList({ className, ...props }) {
  return (
    <TabsPrimitive.List
      className={cn(
        'inline-flex h-10 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground gap-1',
        className
      )}
      {...props}
    />
  )
}
export function TabsTrigger({ className, ...props }) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium',
        'ring-offset-background transition-all duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        'disabled:pointer-events-none disabled:opacity-50',
        'data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm',
        className
      )}
      {...props}
    />
  )
}
export function TabsContent({ className, ...props }) {
  return (
    <TabsPrimitive.Content
      className={cn(
        'mt-4 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className
      )}
      {...props}
    />
  )
}

// ---- Separator ----
export function Separator({ className, orientation = 'horizontal', decorative = true, ...props }) {
  return (
    <SeparatorPrimitive.Root
      decorative={decorative}
      orientation={orientation}
      className={cn(
        'shrink-0 bg-border',
        orientation === 'horizontal' ? 'h-[1px] w-full' : 'h-full w-[1px]',
        className
      )}
      {...props}
    />
  )
}

// ---- Spinner ----
export function Spinner({ className, size = 'md' }) {
  const sizes = { sm: 'w-4 h-4', md: 'w-6 h-6', lg: 'w-8 h-8', xl: 'w-12 h-12' }
  return (
    <div
      className={cn(
        'animate-spin rounded-full border-2 border-border border-t-primary',
        sizes[size] || sizes.md,
        className
      )}
    />
  )
}

// ---- Alert ----
export function Alert({ className, variant = 'default', children, ...props }) {
  const variants = {
    default: 'bg-card border-border',
    destructive: 'border-destructive/30 bg-destructive/10 text-destructive',
    warning: 'border-warning/30 bg-warning/10 text-warning',
    success: 'border-success/30 bg-success/10 text-success',
    info: 'border-info/30 bg-info/10 text-info',
  }
  return (
    <div
      className={cn(
        'relative w-full rounded-xl border p-4',
        variants[variant] || variants.default,
        className
      )}
      role="alert"
      {...props}
    >
      {children}
    </div>
  )
}

export function AlertTitle({ className, ...props }) {
  return <h5 className={cn('mb-1 font-semibold leading-none tracking-tight', className)} {...props} />
}

export function AlertDescription({ className, ...props }) {
  return <div className={cn('text-sm [&_p]:leading-relaxed', className)} {...props} />
}
