import { forwardRef } from 'react'
import { Calendar } from 'lucide-react'
import { cn } from '@/lib/utils'

const DateInput = forwardRef(({ className, value, onChange, ...props }, ref) => {
  return (
    <div className="relative inline-flex h-10 w-full items-center">
      <input
        type="date"
        ref={ref}
        className={cn(
          'flex h-full w-full rounded-lg border border-input bg-background ps-3 pe-10 py-2 text-sm text-right',
          'ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
          'disabled:cursor-not-allowed disabled:opacity-50 transition-colors duration-200',
          'appearance-none',
          '[&::-webkit-datetime-edit]:text-right',
          '[&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0',
          '[&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:w-full',
          '[&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0',
          className
        )}
        dir="rtl"
        value={value || ''}
        onChange={(e) => onChange && onChange(e)}
        {...props}
      />
      <Calendar className="pointer-events-none absolute end-3 h-4 w-4 text-foreground/85" />
    </div>
  )
})
DateInput.displayName = 'DateInput'

export { DateInput }
