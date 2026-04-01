import { forwardRef, useRef } from 'react'
import { Calendar } from 'lucide-react'
import { cn } from '@/lib/utils'

const DateInput = forwardRef(({ className, value, onChange, ...props }, ref) => {
  const inputRef = useRef(null)

  // Format yyyy-mm-dd → yyyy/mm/dd for display
  const displayValue = value
    ? value.replace(/(\d{4})-(\d{2})-(\d{2})/, '$1/$2/$3')
    : ''

  function openPicker() {
    inputRef.current?.showPicker?.()
  }

  return (
    <div
      className={cn(
        'relative inline-flex items-center cursor-pointer',
        'rounded-lg border border-input bg-background',
        'focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'transition-colors duration-200',
        className
      )}
      onClick={openPicker}
    >
      {/* Native date input (invisible, handles all picker interaction) */}
      <input
        type="date"
        ref={inputRef}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        dir="rtl"
        value={value || ''}
        onChange={(e) => onChange && onChange(e)}
        onClick={(e) => e.stopPropagation()}
        {...props}
      />
      {/* Formatted display */}
      <span
        className="flex h-10 items-center px-3 pl-10 text-sm w-full text-right"
        dir="rtl"
      >
        {displayValue || <span className="text-muted-foreground">{props.placeholder || ''}</span>}
      </span>
      <Calendar className="absolute left-3 w-4 h-4 text-muted-foreground pointer-events-none" />
    </div>
  )
})
DateInput.displayName = 'DateInput'

export { DateInput }
