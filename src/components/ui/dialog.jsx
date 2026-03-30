import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

const Dialog = DialogPrimitive.Root
const DialogTrigger = DialogPrimitive.Trigger
const DialogPortal = DialogPrimitive.Portal
const DialogClose = DialogPrimitive.Close

function DialogOverlay({ className, ...props }) {
  return (
    <DialogPrimitive.Overlay
      className={cn(
        'fixed inset-0 z-50 bg-black/60 backdrop-blur-sm',
        'data-[state=open]:animate-in data-[state=closed]:animate-out',
        'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
        className
      )}
      {...props}
    />
  )
}

function DialogContent({ className, children, title, ...props }) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        className={cn(
          'fixed start-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%]',
          'w-full max-w-lg max-h-[90vh] overflow-y-auto',
          'bg-card border border-border rounded-2xl shadow-2xl',
          'data-[state=open]:animate-in data-[state=closed]:animate-out',
          'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
          'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
          'p-0',
          className
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className="absolute start-4 top-4 rounded-lg opacity-70 hover:opacity-100 transition-opacity focus:outline-none focus:ring-2 focus:ring-ring">
          <X className="h-4 w-4" />
          <span className="sr-only">إغلاق</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }) {
  return (
    <div
      className={cn('flex flex-col gap-1.5 p-6 pb-4 border-b border-border', className)}
      {...props}
    />
  )
}

function DialogFooter({ className, ...props }) {
  return (
    <div
      className={cn('flex items-center justify-start gap-3 p-6 pt-4 border-t border-border', className)}
      {...props}
    />
  )
}

function DialogTitle({ className, ...props }) {
  return (
    <DialogPrimitive.Title
      className={cn('text-lg font-bold text-foreground', className)}
      {...props}
    />
  )
}

function DialogDescription({ className, ...props }) {
  return (
    <DialogPrimitive.Description
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}
