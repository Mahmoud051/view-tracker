import { forwardRef } from 'react'
import { Calendar } from 'lucide-react'
import { cn } from '@/lib/utils'

const DateInput = forwardRef(({ className, ...props }, ref) => {
  return (
    <div className="relative inline-flex items-center">
      <input
        type="date"
        className={cn(
          'flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm pr-10',
          'ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium',
          'placeholder:text-muted-foreground',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'transition-colors duration-200',
          // Hide native calendar icon
          '[&::-webkit-calendar-picker-indicator]:hidden',
          '[&::-moz-calendar-picker-indicator]:hidden',
          className
        )}
        ref={ref}
        {...props}
      />
      <Calendar className="absolute right-3 w-4 h-4 text-muted-foreground pointer-events-none" />
    </div>
  )
})
DateInput.displayName = 'DateInput'

export { DateInput }
