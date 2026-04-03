import DatePickerModule from 'react-multi-date-picker'
import gregorian_ar from 'react-date-object/locales/gregorian_ar'
import { CalendarIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

const DatePicker = DatePickerModule.default ?? DatePickerModule
const westernDigits = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']

function DateInput({ className, value, onChange, disabled, readOnly, placeholder = 'اختر التاريخ', ...props }) {
  const emitChange = (dateObject) => {
    if (!onChange) return

    onChange({
      target: {
        value: dateObject?.isValid ? dateObject.format('YYYY-MM-DD') : '',
      },
    })
  }

  return (
    <DatePicker
      value={value || ''}
      locale={gregorian_ar}
      digits={westernDigits}
      format="YYYY-MM-DD"
      onChange={emitChange}
      hideWeekDays
      editable={false}
      disabled={disabled}
      readOnly={readOnly}
      arrow={false}
      shadow={false}
      zIndex={9999}
      fixRelativePosition
      calendarPosition="bottom-right"
      portal={document.body}
      containerClassName="app-date-picker-container"
      className="app-date-picker"
      render={(formattedValue, openCalendar) => (
        <button
          type="button"
          dir="rtl"
          onClick={() => {
            if (!disabled && !readOnly) openCalendar()
          }}
          disabled={disabled}
          aria-label={placeholder}
          className={cn(
            'relative inline-flex h-10 w-full items-center rounded-lg border border-input bg-background ps-3 pe-10 py-2 text-sm text-right text-foreground',
            'ring-offset-background transition-colors duration-200',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
            'disabled:cursor-not-allowed disabled:opacity-50',
            !formattedValue && 'text-muted-foreground',
            className
          )}
        >
          <span className="block w-full truncate text-right" dir="ltr">
            {formattedValue || placeholder}
          </span>
          <CalendarIcon className="pointer-events-none absolute left-3 h-4 w-4 text-muted-foreground" />
        </button>
      )}
      {...props}
    />
  )
}

export { DateInput }
