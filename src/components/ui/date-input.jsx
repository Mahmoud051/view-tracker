import { useState, useCallback } from 'react'
import { DayPicker } from 'react-day-picker'
import { ar } from 'date-fns/locale'
import { format } from 'date-fns'
import { CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

// Arabic month names
const ARABIC_MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
]

function arabicNum(s) {
  return String(s).replace(/[0-9]/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d])
}

function DateInput({ className, value, onChange, disabled, readOnly, placeholder = 'اختر التاريخ' }) {
  const [open, setOpen] = useState(false)
  const [displayMonth, setDisplayMonth] = useState(value ? new Date(value + 'T00:00:00') : new Date())

  // Parse the stored value into a Date object
  const selectedDate = value ? new Date(value + 'T00:00:00') : undefined

  const handleSelect = useCallback((date) => {
    if (!date) return
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const formatted = `${year}-${month}-${day}`

    onChange?.({ target: { value: formatted } })
    setOpen(false)
  }, [onChange])

  // Format display value with Arabic digits
  const displayValue = selectedDate ? (() => {
    const westernDigits = String(selectedDate.getDate())
    return `${arabicNum(westernDigits)} ${ARABIC_MONTHS[selectedDate.getMonth()]} ${arabicNum(selectedDate.getFullYear())}`
  })() : ''

  // Format the month/year label in Arabic
  const monthLabel = ARABIC_MONTHS[displayMonth.getMonth()] + ' ' + arabicNum(displayMonth.getFullYear())

  return (
    <>
      <button
        type="button"
        dir="rtl"
        onClick={() => {
          if (!disabled && !readOnly) {
            setDisplayMonth(selectedDate ? new Date(selectedDate) : new Date())
            setOpen(true)
          }
        }}
        disabled={disabled}
        aria-label={placeholder}
        className={cn(
          'relative inline-flex h-10 w-full items-center rounded-lg border border-input bg-background ps-3 pe-10 py-2 text-sm text-right text-foreground',
          'ring-offset-background transition-colors duration-200',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
          'disabled:cursor-not-allowed disabled:opacity-50',
          !displayValue && 'text-muted-foreground',
          className
        )}
      >
        <span className="block w-full truncate text-right" dir="ltr">
          {displayValue || placeholder}
        </span>
        <CalendarIcon className="pointer-events-none absolute left-3 h-4 w-4 text-muted-foreground" />
      </button>

      <DialogPrimitive.Root open={open} onOpenChange={(isOpen) => {
        setOpen(isOpen)
        if (isOpen) {
          setDisplayMonth(selectedDate ? new Date(selectedDate) : new Date())
        }
      }}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay
            className="fixed inset-0 z-[9998] bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
          />
          <DialogPrimitive.Content
            dir="rtl"
            className={cn(
              'fixed z-[9999] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2',
              'w-[90vw] max-w-sm',
              'bg-card border border-border rounded-2xl shadow-2xl',
              'data-[state=open]:animate-in data-[state=closed]:animate-out',
              'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
              'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
              'p-0'
            )}
          >
            <div className="flex items-center justify-between gap-3 p-4 pb-2 border-b border-border">
              <DialogPrimitive.Title className="text-base font-bold text-foreground flex-1">
                اختر التاريخ
              </DialogPrimitive.Title>
              <DialogPrimitive.Close className="flex-shrink-0 rounded-lg opacity-70 hover:opacity-100 transition-opacity focus:outline-none focus:ring-2 focus:ring-ring">
                <X className="h-4 w-4" />
                <span className="sr-only">إغلاق</span>
              </DialogPrimitive.Close>
            </div>

            {/* Custom header with arrows and month name */}
            <div className="flex items-center justify-center gap-3 px-4 pt-4">
              <button
                type="button"
                onClick={() => {
                  const prev = new Date(displayMonth)
                  prev.setMonth(prev.getMonth() - 1)
                  setDisplayMonth(prev)
                }}
                className="w-9 h-9 flex items-center justify-center rounded-lg border border-border hover:bg-muted text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex-shrink-0"
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              <span className="text-sm font-bold text-white min-w-[140px] text-center select-none">
                {monthLabel}
              </span>

              <button
                type="button"
                onClick={() => {
                  const next = new Date(displayMonth)
                  next.setMonth(next.getMonth() + 1)
                  setDisplayMonth(next)
                }}
                className="w-9 h-9 flex items-center justify-center rounded-lg border border-border hover:bg-muted text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex-shrink-0"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3">
              <DayPicker
                mode="single"
                selected={selectedDate}
                onSelect={handleSelect}
                locale={ar}
                showOutsideDays
                fixedWeeks
                month={displayMonth}
                onMonthChange={setDisplayMonth}
                className="rdp"
                classNames={{
                  months: 'rdp-Months flex flex-col items-center gap-4',
                  month: 'rdp-Month space-y-4 w-full',
                  caption: 'rdp-Caption hidden',
                  month_grid: 'rdp-MonthGrid w-full border-collapse',
                  weekdays: 'rdp-Weekdays flex justify-between',
                  weekday: 'rdp-Weekday text-muted-foreground text-xs font-medium w-9 text-center',
                  week: 'rdp-Week flex justify-between mb-1',
                  day: 'rdp-Day w-9 h-9 text-center text-sm p-0 relative flex items-center justify-center rounded-lg transition-colors',
                  day_button: 'rdp-DayButton w-9 h-9 flex items-center justify-center rounded-lg text-foreground hover:bg-muted hover:text-foreground cursor-pointer',
                  selected: 'bg-primary text-primary-foreground rounded-lg',
                  today: 'bg-muted/50 rounded-lg font-bold',
                  outside: 'text-muted-foreground opacity-50',
                  hidden: 'invisible',
                }}
              />
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  )
}

export { DateInput }
