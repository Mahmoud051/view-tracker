import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, differenceInDays, isAfter, isBefore, parseISO } from 'date-fns'
import { arEG } from 'date-fns/locale'

export function cn(...inputs) {
  return twMerge(clsx(inputs))
}

// Format date to Arabic locale DD/MM/YYYY
export function formatDate(date) {
  if (!date) return '—'
  try {
    const d = typeof date === 'string' ? parseISO(date) : date
    return format(d, 'dd/MM/yyyy')
  } catch {
    return '—'
  }
}

// Format currency in EGP
export function formatCurrency(amount) {
  if (amount === null || amount === undefined) return '0 جنيه'
  return `${Number(amount).toLocaleString('ar-EG')} جنيه`
}

// Days remaining from today until a date
export function daysRemaining(dateStr) {
  if (!dateStr) return null
  try {
    const target = typeof dateStr === 'string' ? parseISO(dateStr) : dateStr
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return differenceInDays(target, today)
  } catch {
    return null
  }
}

// Compute government permit status based on end date
export function computeGovStatus(govRentalEnd) {
  if (!govRentalEnd) return 'active'
  const days = daysRemaining(govRentalEnd)
  if (days === null) return 'active'
  if (days < 0) return 'expired'
  if (days <= 30) return 'renewal_pending'
  return 'active'
}

// Compute contract status based on dates
export function computeContractStatus(startDate, endDate, storedStatus) {
  if (storedStatus === 'terminated') return 'terminated'
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  try {
    const start = typeof startDate === 'string' ? parseISO(startDate) : startDate
    const end = typeof endDate === 'string' ? parseISO(endDate) : endDate
    if (isAfter(start, today)) return 'upcoming'
    if (isBefore(end, today)) return 'expired'
    return 'active'
  } catch {
    return storedStatus || 'active'
  }
}

// Status display labels
export const statusLabels = {
  active: 'نشط',
  expired: 'منتهي',
  upcoming: 'قادم',
  terminated: 'مُنهى',
  renewal_pending: 'يحتاج تجديد',
  available: 'متاح',
  rented: 'مؤجر',
  inactive: 'متوقف',
}

export const rentalTypeLabels = {
  monthly: 'شهري',
  quarterly: 'ربع سنوي',
  semi_annual: 'نصف سنوي',
  annual: 'سنوي',
}

export const paymentFrequencyLabels = {
  monthly: 'شهري',
  quarterly: 'ربع سنوي',
  semi_annual: 'نصف سنوي',
  annual: 'سنوي',
}

export const paymentMethodLabels = {
  cash: 'نقداً',
  transfer: 'تحويل بنكي',
  other: 'أخرى',
}

// Calculate end date from start date and rental type
export function calculateEndDate(startDate, rentalType) {
  if (!startDate || !rentalType) return ''
  try {
    const start = typeof startDate === 'string' ? parseISO(startDate) : new Date(startDate)
    const result = new Date(start)
    switch (rentalType) {
      case 'monthly':
        result.setMonth(result.getMonth() + 1)
        break
      case 'quarterly':
        result.setMonth(result.getMonth() + 3)
        break
      case 'semi_annual':
        result.setMonth(result.getMonth() + 6)
        break
      case 'annual':
        result.setFullYear(result.getFullYear() + 1)
        break
    }
    result.setDate(result.getDate() - 1)
    return format(result, 'yyyy-MM-dd')
  } catch {
    return ''
  }
}

// Get last 6 months labels in Arabic
export function getLast6MonthsLabels() {
  const months = []
  const today = new Date()
  for (let i = 5; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1)
    months.push({
      label: format(d, 'MMM yyyy', { locale: arEG }),
      year: d.getFullYear(),
      month: d.getMonth() + 1,
    })
  }
  return months
}

// Generate contract serial number display
export function contractSerial(id) {
  if (!id) return '—'
  return `#${id.substring(0, 8).toUpperCase()}`
}

// Safe number parse
export function safeNum(val) {
  const n = parseFloat(val)
  return isNaN(n) ? 0 : n
}

// Convert Date to YYYY-MM-DD in local time (not UTC)
export function toLocalDateStr(date) {
  const d = new Date(date)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// Add days to a YYYY-MM-DD date string, return YYYY-MM-DD string (local time)
export function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const result = new Date(y, m - 1, d + days)
  return toLocalDateStr(result)
}

// Today as YYYY-MM-DD string (local time, not UTC)
export function todayStr() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
