import { ChevronLeft, ChevronRight } from 'lucide-react'
import { DayPicker } from 'react-day-picker'
import { arEG } from 'date-fns/locale'
import { buttonVariants } from './button'
import { cn } from '@/lib/utils'

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}) {
  return (
    <DayPicker
      dir="rtl"
      locale={arEG}
      showOutsideDays={showOutsideDays}
      className={cn('p-3', className)}
      classNames={{
        months: 'flex flex-col gap-4 sm:flex-row',
        month: 'space-y-4',
        caption: 'relative flex items-center justify-center pt-1',
        caption_label: 'text-sm font-semibold text-foreground',
        nav: 'pointer-events-none absolute inset-x-0 top-1 flex items-center justify-between',
        nav_button: cn(
          buttonVariants({ variant: 'outline', size: 'icon-sm' }),
          'pointer-events-auto h-7 w-7 rounded-md border-border bg-background text-foreground p-0 opacity-100 hover:bg-secondary hover:text-foreground dark:bg-muted dark:text-foreground'
        ),
        nav_button_previous: 'static',
        nav_button_next: 'static',
        table: 'w-full border-collapse space-y-1',
        weekdays: 'hidden',
        head_row: 'flex',
        head_cell: 'w-9 rounded-md text-[0.8rem] font-medium text-muted-foreground',
        row: 'mt-2 flex w-full',
        cell: 'relative h-9 w-9 p-0 text-center text-sm focus-within:relative focus-within:z-20',
        day: cn(
          buttonVariants({ variant: 'ghost' }),
          'h-9 w-9 rounded-md p-0 font-normal aria-selected:opacity-100'
        ),
        day_selected:
          'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground',
        day_today: 'bg-secondary text-secondary-foreground',
        day_outside: 'text-muted-foreground/50 opacity-50',
        day_disabled: 'text-muted-foreground opacity-50',
        day_hidden: 'invisible',
        ...classNames,
      }}
      components={{
        IconLeft: (iconProps) => <ChevronRight className="h-4 w-4" {...iconProps} />,
        IconRight: (iconProps) => <ChevronLeft className="h-4 w-4" {...iconProps} />,
      }}
      {...props}
    />
  )
}

export { Calendar }
