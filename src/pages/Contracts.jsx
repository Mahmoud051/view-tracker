import { useEffect, useState, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, Search, FileText, UserPlus, X, ChevronDown, Calendar } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatDate, formatCurrency, safeNum, todayStr, toLocalDateStr, addDays, computeContractStatus, cn, paymentIntervalMonths, getDurationCompatibilityError } from '@/lib/utils'
import { useToast } from '@/contexts/ToastContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DateInput } from '@/components/ui'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Textarea } from '@/components/ui/index'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/index'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { PageHeader, StatusBadge, EmptyState, LoadingScreen, FormField } from '@/components/ui/shared'
import { Badge } from '@/components/ui/badge'

// payment interval = how many months between each payment
// monthly: 1, quarterly: 3, semi_annual: 6, annual: 12
const INTERVAL_MONTHS = paymentIntervalMonths

const INTERVAL_LABELS = {
  monthly: 'شهري (كل شهر)',
  quarterly: 'ربع سنوي (كل 3 أشهر)',
  semi_annual: 'نصف سنوي (كل 6 أشهر)',
  annual: 'سنوي (كل 12 شهر)',
}

const EMPTY_FORM = {
  stand_id: '', client_id: '', start_date: todayStr(), end_date: '',
  duration_months: '', monthly_rate: '',
  payment_interval: 'monthly',
  total_value: '', price_per_period: '',
  notes: '', status: 'active', previous_end_date: null,
  is_open: false,
}
const EMPTY_CLIENT = { name: '', phone: '' }

// ---- Searchable Select for Stand ----
function StandSearchSelect({ stands, value, onChange, error }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef(null)
  const selected = stands.find(s => s.id === value)

  const filtered = (stands || []).filter(s =>
    !search ||
    s.code?.toLowerCase().includes(search.toLowerCase()) ||
    s.address?.toLowerCase().includes(search.toLowerCase())
  )

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={`w-full flex items-center justify-between h-10 px-3 rounded-lg border bg-background text-sm transition-colors ${error ? 'border-destructive' : 'border-input'} hover:border-primary/50`}
      >
        <span className={selected ? 'text-foreground' : 'text-muted-foreground'}>
          {selected ? <span className="font-medium">{selected.code}</span> : 'اختر اللوحة'}
          {selected && <span className="text-muted-foreground ms-2 text-xs">— {selected.address?.slice(0, 25)}</span>}
        </span>
        <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
      </button>
      {open && (
        <div className="absolute z-50 w-full mt-1 bg-card border border-border rounded-xl shadow-2xl overflow-hidden">
          <div className="relative p-2 border-b border-border">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="ابحث بالكود أو العنوان..."
              className="w-full h-8 px-3 py-1 text-sm bg-transparent outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="max-h-52 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-center text-muted-foreground text-sm py-4">لا توجد لوحات</p>
            ) : filtered.map(s => (
              <button
                key={s.id}
                type="button"
                onClick={() => { onChange(s.id); setOpen(false); setSearch('') }}
                className={`w-full text-start px-3 py-2.5 text-sm hover:bg-muted transition-colors ${value === s.id ? 'bg-primary/10' : ''}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <span className="font-semibold text-foreground">{s.code}</span>
                    <span className="text-muted-foreground ms-2 text-xs">{s.address?.slice(0, 30)}</span>
                  </div>
                  {s.is_active === false && <Badge className="bg-muted text-muted-foreground text-xs">متوقف</Badge>}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
      {error && <p className="text-xs text-destructive mt-1">{error}</p>}
    </div>
  )
}

// ---- Searchable Select for Client ----
function ClientSearchSelect({ clients, value, onChange, onAddNew }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef(null)
  const selected = clients.find(c => c.id === value)

  const filtered = (clients || []).filter(c =>
    !search ||
    c.name?.toLowerCase().includes(search.toLowerCase()) ||
    c.phone?.toLowerCase().includes(search.toLowerCase())
  )

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div ref={ref} className="relative">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          className="flex-1 flex items-center justify-between h-10 px-3 rounded-lg border border-input bg-background text-sm hover:border-primary/50 transition-colors"
        >
          <span className={selected ? 'text-foreground' : 'text-muted-foreground'}>
            {selected ? <span className="font-medium">{selected.name}</span> : 'اختر العميل'}
            {selected && <span className="text-muted-foreground ms-2 text-xs" dir="ltr">{selected.phone}</span>}
          </span>
          <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        </button>
        <Button size="icon" variant="outline" onClick={() => { onAddNew(); setOpen(false) }} title="إضافة عميل جديد">
          <UserPlus className="w-4 h-4" />
        </Button>
      </div>
      {open && (
        <div className="absolute z-50 w-full mt-1 bg-card border border-border rounded-xl shadow-2xl overflow-hidden">
          <div className="relative p-2 border-b border-border">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="ابحث بالاسم أو الهاتف..."
              className="w-full h-8 px-3 py-1 text-sm bg-transparent outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="max-h-52 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-center text-muted-foreground text-sm py-4">لا توجد عملاء</p>
            ) : filtered.map(c => (
              <button
                key={c.id}
                type="button"
                onClick={() => { onChange(c.id); setOpen(false); setSearch('') }}
                className={`w-full text-start px-3 py-2.5 text-sm hover:bg-muted transition-colors ${value === c.id ? 'bg-primary/10' : ''}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-foreground">{c.name}</span>
                  <span className="text-muted-foreground text-xs" dir="ltr">{c.phone}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function Contracts() {
  const [contracts, setContracts] = useState([])
  const [stands, setStands] = useState([])
  const [clients, setClients] = useState([])
  const [paymentsMap, setPaymentsMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [clientDialogOpen, setClientDialogOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [clientForm, setClientForm] = useState(EMPTY_CLIENT)
  const [saving, setSaving] = useState(false)
  const [formErrors, setFormErrors] = useState({})
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { toast } = useToast()

  useEffect(() => {
    fetchData()
    const standId = searchParams.get('stand')
    if (standId) { setForm(f => ({ ...f, stand_id: standId })); setDialogOpen(true) }
  }, [])

  async function fetchData() {
    setLoading(true)
    const [{ data: c }, { data: s }, { data: cl }, { data: p }] = await Promise.all([
      supabase.from('contracts').select('*, stands(code, address), clients(name, phone)').order('created_at', { ascending: false }),
      supabase.from('stands').select('id, code, address, is_active').order('code'),
      supabase.from('clients').select('id, name, phone').order('name'),
      supabase.from('payments').select('contract_id, amount'),
    ])
    setContracts(c || [])
    // Filter out inactive stands from the dropdown
    setStands((s || []).filter(stand => stand.is_active !== false))
    setClients(cl || [])
    const pm = {}
    ;(p || []).forEach(pay => { pm[pay.contract_id] = (pm[pay.contract_id] || 0) + safeNum(pay.amount) })
    setPaymentsMap(pm)
    setLoading(false)
  }

  async function onStandChange(standId) {
    let prevEndDate = null
    if (standId) {
      const { data: prev } = await supabase
        .from('contracts')
        .select('end_date, status')
        .eq('stand_id', standId)
        .neq('status', 'terminated')
        .order('end_date', { ascending: false })
        .limit(1)
        .single()
      if (prev) prevEndDate = prev.end_date
    }
    setForm(f => ({ ...f, stand_id: standId, start_date: todayStr(), previous_end_date: prevEndDate }))
  }

  const filtered = (contracts || []).filter(c => {
    const matchStatus = filter === 'all' || c.status === filter
    const matchSearch = !search ||
      c.stands?.code?.toLowerCase().includes(search.toLowerCase()) ||
      c.clients?.name?.toLowerCase().includes(search.toLowerCase())
    return matchStatus && matchSearch
  })

  function computeValues(startDate, durationMonths, monthlyRate, interval, isOpen) {
    if (isOpen) {
      // Open contract: no end date, no total value calculation
      return { end_date: '', total_value: '', price_per_period: '' }
    }
    if (!startDate || !durationMonths) {
      return { end_date: '', total_value: '', price_per_period: '' }
    }
    try {
      const start = new Date(startDate)
      start.setMonth(start.getMonth() + parseInt(durationMonths))
      start.setDate(start.getDate() - 1)
      const endStr = toLocalDateStr(start)
      const months = parseInt(durationMonths)
      const rate = parseFloat(monthlyRate) || 0
      const total = months * rate
      const intervalMonths = INTERVAL_MONTHS[interval] || 1
      const perPeriod = rate * intervalMonths
      return {
        end_date: endStr,
        total_value: total > 0 ? total.toFixed(2) : '',
        price_per_period: perPeriod > 0 ? perPeriod.toFixed(2) : '',
      }
    } catch {
      return { end_date: '', total_value: '', price_per_period: '' }
    }
  }

  function onFormChange(field, value) {
    const updated = { ...form, [field]: value }
    if (field === 'start_date' || field === 'duration_months' || field === 'monthly_rate' || field === 'payment_interval' || field === 'is_open') {
      const computed = computeValues(
        field === 'start_date' ? value : updated.start_date,
        field === 'duration_months' ? value : updated.duration_months,
        field === 'monthly_rate' ? value : updated.monthly_rate,
        field === 'payment_interval' ? value : updated.payment_interval,
        field === 'is_open' ? value : updated.is_open,
      )
      updated.end_date = computed.end_date
      updated.total_value = computed.total_value
      updated.price_per_period = computed.price_per_period
    }
    setForm(updated)
  }

  function validateForm() {
    const errs = {}
    if (!form.stand_id) errs.stand_id = 'اختر اللوحة'
    if (!form.client_id) errs.client_id = 'اختر العميل'
    if (!form.start_date) errs.start_date = 'تاريخ البداية مطلوب'
    if (form.previous_end_date && form.start_date < form.previous_end_date) {
      errs.start_date = `يجب أن يكون بعد أو مساوياً لتاريخ انتهاء العقد السابق (${formatDate(form.previous_end_date)})`
    }
    // Only validate duration if not open contract
    if (!form.is_open) {
      const durationError = getDurationCompatibilityError(form.duration_months, form.payment_interval)
      if (durationError) errs.duration_months = durationError
    }
    if (!form.monthly_rate || isNaN(form.monthly_rate) || parseFloat(form.monthly_rate) <= 0) errs.monthly_rate = 'السعر الشهري مطلوب'
    setFormErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function handleSave() {
    if (!validateForm()) return
    setSaving(true)
    try {
      // Check if stand already has an active or open contract (not terminated)
      const { data: existing } = await supabase
        .from('contracts')
        .select('id, status')
        .eq('stand_id', form.stand_id)
        .neq('status', 'terminated')
        .neq('status', 'expired')
        .limit(1)

      if (existing && existing.length > 0) {
        const existingContract = existing[0]
        // Block if stand has active or upcoming contract
        if (existingContract.status === 'active' || existingContract.status === 'upcoming') {
          toast({ 
            title: 'خطأ', 
            description: 'هذه اللوحة لديها عقد نشط أو قادم بالفعل. لا يمكن إنشاء عقد جديد حتى ينتهي العقد السابق.', 
            variant: 'error' 
          })
          setSaving(false)
          return
        }
      }

      let status = form.status
      const today = toLocalDateStr(new Date())
      if (form.start_date > today) status = 'upcoming'

      const { error } = await supabase.from('contracts').insert([{
        stand_id: form.stand_id,
        client_id: form.client_id,
        start_date: form.start_date,
        end_date: form.is_open ? null : form.end_date,
        duration_months: form.is_open ? null : (parseInt(form.duration_months) || null),
        payment_frequency: form.payment_interval,
        monthly_rate: parseFloat(form.monthly_rate),
        price_per_period: form.is_open ? null : (parseFloat(form.price_per_period) || null),
        total_value: form.is_open ? null : (parseFloat(form.total_value) || null),
        status,
        notes: form.notes || null,
        is_open: form.is_open,
      }])
      if (error) throw error
      toast({ title: 'تم الحفظ', description: `تم إنشاء العقد بحالة: ${status === 'upcoming' ? 'قادم' : 'نشط'}${form.is_open ? ' (عقد مفتوح)' : ''}`, variant: 'success' })
      setDialogOpen(false)
      setForm({ ...EMPTY_FORM, start_date: todayStr() })
      fetchData()
    } catch (e) { toast({ title: 'خطأ', description: e.message, variant: 'error' }) }
    setSaving(false)
  }

  async function saveClient() {
    if (!clientForm.name.trim()) { toast({ title: 'خطأ', description: 'الاسم مطلوب', variant: 'error' }); return }
    const { data, error } = await supabase.from('clients').insert([{ name: clientForm.name, phone: clientForm.phone }]).select().single()
    if (!error && data) {
      setClients(prev => [...prev, data])
      setForm(f => ({ ...f, client_id: data.id }))
      setClientForm(EMPTY_CLIENT)
      setClientDialogOpen(false)
      toast({ title: 'تم إضافة العميل', variant: 'success' })
    }
  }

  if (loading) return <LoadingScreen />

  const statusTabs = [
    { value: 'all', label: 'الكل' },
    { value: 'active', label: 'نشط' },
    { value: 'upcoming', label: 'قادم' },
    { value: 'expired', label: 'منتهي' },
    { value: 'terminated', label: 'مُنهى' },
  ]

  const intervalMonths = INTERVAL_MONTHS[form.payment_interval] || 1
  const monthlyRate = parseFloat(form.monthly_rate) || 0
  const perPeriodAmount = monthlyRate * intervalMonths
  const durationErrorPreview = getDurationCompatibilityError(form.duration_months, form.payment_interval)

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="العقود" description={`${contracts.length} عقد إجمالاً`}>
        <Button onClick={() => setDialogOpen(true)}><Plus className="w-4 h-4" /> عقد جديد</Button>
      </PageHeader>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex gap-1 flex-wrap">
          {statusTabs.map(t => (
            <button
              key={t.value}
              onClick={() => setFilter(t.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${filter === t.value ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="بحث..." value={search} onChange={e => setSearch(e.target.value)} className="ps-9 h-8 text-xs" />
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <EmptyState icon={FileText} title="لا توجد عقود" description="لم يتم العثور على عقود" action={<Button onClick={() => setDialogOpen(true)}><Plus className="w-4 h-4" /> عقد جديد</Button>} />
      ) : (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>اللوحة</TableHead><TableHead>العميل</TableHead><TableHead>المدة</TableHead>
                  <TableHead>البداية</TableHead><TableHead>النهاية</TableHead><TableHead>القيمة الإجمالية</TableHead>
                  <TableHead>المدفوع</TableHead><TableHead>مستحق الآن</TableHead><TableHead>الحالة</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(c => {
                  const paid = paymentsMap[c.id] || 0
                  const realStatus = computeContractStatus(c.start_date, c.end_date, c.status)

                  // Calculate totalValue for open contracts using elapsed periods
                  let contractTotalValue
                  if (c.is_open) {
                    if (!c.start_date || !c.monthly_rate) {
                      contractTotalValue = paid
                    } else {
                      const start = new Date(c.start_date)
                      const end = c.end_date ? new Date(c.end_date) : null
                      const nowCapped = end && new Date() > end ? end : new Date()
                      const intervalMonths = INTERVAL_MONTHS[c.payment_frequency || 'monthly'] || 1
                      const periodRate = safeNum(c.monthly_rate) * intervalMonths
                      const rawMonths = (nowCapped.getFullYear() - start.getFullYear()) * 12 + (nowCapped.getMonth() - start.getMonth())
                      const completeMonths = nowCapped.getDate() >= start.getDate() ? rawMonths + 1 : rawMonths
                      const periodsDue = Math.ceil(completeMonths / intervalMonths)
                      contractTotalValue = periodsDue * periodRate
                    }
                  } else {
                    contractTotalValue = safeNum(c.total_value)
                  }
                  const owed = Math.max(0, contractTotalValue - paid)

                  // Period-based amount due (for all non-upcoming contracts)
                  let periodDue = 0
                  if (c.start_date && realStatus !== 'upcoming') {
                    const INTERVAL_MONTHS = { monthly: 1, quarterly: 3, semi_annual: 6, annual: 12 }
                    const now = new Date()
                    const start = new Date(c.start_date)
                    // Default to monthly if payment_frequency is not set
                    const paymentFreq = c.payment_frequency || 'monthly'
                    // Cap at end_date for terminated/expired/open contracts
                    const end = c.end_date ? new Date(c.end_date) : null
                    const nowCapped = end && now > end ? end : now
                    // For open contracts, prefer monthly_rate; otherwise calculate from total_value
                    const monthlyRate = (c.is_open && c.monthly_rate) ? safeNum(c.monthly_rate) : (safeNum(c.total_value) / (parseInt(c.duration_months) || 1))
                    const intervalMonths = INTERVAL_MONTHS[paymentFreq] || 1
                    const periodRate = monthlyRate * intervalMonths

                    let periodsDue
                    if (c.is_open) {
                      const rawMonths = (nowCapped.getFullYear() - start.getFullYear()) * 12 + (nowCapped.getMonth() - start.getMonth())
                      const completeMonths = nowCapped.getDate() >= start.getDate() ? rawMonths + 1 : rawMonths
                      periodsDue = Math.ceil(completeMonths / intervalMonths)
                    } else {
                      const totalPeriods = Math.ceil((parseInt(c.duration_months) || 1) / intervalMonths)
                      const rawMonths = (nowCapped.getFullYear() - start.getFullYear()) * 12 + (nowCapped.getMonth() - start.getMonth())
                      const completeMonths = nowCapped.getDate() >= start.getDate() ? rawMonths + 1 : rawMonths
                      periodsDue = Math.min(Math.ceil(completeMonths / intervalMonths), totalPeriods)
                    }
                    periodDue = Math.max(0, periodsDue * periodRate - paid)
                  }
                  return (
                    <TableRow key={c.id} className="cursor-pointer" onClick={() => navigate(`/contracts/${c.id}`)}>
                      <TableCell>
                        <p className="font-semibold text-sm">{c.stands?.code}</p>
                        <p className="text-xs text-muted-foreground truncate max-w-[120px]">{c.stands?.address}</p>
                      </TableCell>
                      <TableCell>
                        <p className="font-medium text-sm">{c.clients?.name}</p>
                        <p className="text-xs text-muted-foreground">{c.clients?.phone}</p>
                      </TableCell>
                      <TableCell className="text-sm">{c.is_open ? 'مفتوح' : `${c.duration_months} شهر`}</TableCell>
                      <TableCell className="text-sm">{formatDate(c.start_date)}</TableCell>
                      <TableCell className="text-sm">
                        {c.is_open ? (
                          <span className="text-xs font-medium text-info">بدون نهاية</span>
                        ) : (
                          <p>{formatDate(c.end_date)}</p>
                        )}
                        {!c.is_open && realStatus !== 'expired' && realStatus !== 'terminated' && c.end_date && (() => {
                          const daysLeft = Math.ceil((new Date(c.end_date) - new Date()) / 86400000)
                          if (daysLeft <= 0) return null
                          return (
                            <span className={cn('text-xs font-medium px-1.5 py-0.5 rounded-full mt-0.5 inline-block', daysLeft <= 30 ? 'bg-destructive/15 text-destructive' : daysLeft <= 90 ? 'bg-warning/15 text-warning' : 'bg-success/15 text-success')}>
                              {daysLeft} يوم
                            </span>
                          )
                        })()}
                      </TableCell>
                      <TableCell className="text-sm font-medium">{c.is_open ? '—' : formatCurrency(c.total_value)}</TableCell>
                      <TableCell className={`text-sm font-medium ${paid >= contractTotalValue ? 'text-success' : 'text-muted-foreground'}`}>
                        {formatCurrency(paid)}
                      </TableCell>
                      <TableCell className={`text-sm font-medium ${periodDue > 0 ? 'text-destructive' : 'text-success'}`}>
                        {formatCurrency(periodDue)}
                      </TableCell>
                      <TableCell><StatusBadge status={realStatus} /></TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Create Contract Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>إنشاء عقد جديد</DialogTitle></DialogHeader>
          <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[60vh] overflow-y-auto">
            <FormField label="اللوحة الإعلانية" required error={formErrors.stand_id} className="sm:col-span-2">
              <StandSearchSelect
                stands={stands}
                value={form.stand_id}
                onChange={onStandChange}
                error={formErrors.stand_id}
              />
            </FormField>
            <FormField label="العميل" required error={formErrors.client_id} className="sm:col-span-2">
              <ClientSearchSelect
                clients={clients}
                value={form.client_id}
                onChange={v => setForm(f => ({ ...f, client_id: v }))}
                onAddNew={() => setClientDialogOpen(true)}
              />
            </FormField>

            {/* Open Contract Toggle */}
            <div className="sm:col-span-2 flex items-center gap-3 p-3 rounded-xl border border-border bg-muted/30">
              <input
                type="checkbox"
                id="is_open"
                checked={form.is_open}
                onChange={e => onFormChange('is_open', e.target.checked)}
                className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
              />
              <label htmlFor="is_open" className="text-sm font-medium text-foreground cursor-pointer">
                عقد مفتوح (بدون تاريخ نهاية)
              </label>
            </div>

            <FormField label="تاريخ البداية" required error={formErrors.start_date}>
              <DateInput
                value={form.start_date}
                onChange={e => onFormChange('start_date', e.target.value)}
              />
              {form.previous_end_date && (
                <p className="text-xs text-muted-foreground mt-1">العقد السابق ينتهي: <span className="font-medium">{formatDate(form.previous_end_date)}</span> — يجب أن يكون البداية ≥ نهاية السابق</p>
              )}
            </FormField>
            {!form.is_open && (
              <FormField label="مدة العقد (أشهر)" required error={formErrors.duration_months}>
                <Input
                  type="number"
                  value={form.duration_months}
                  min="1"
                  onChange={e => onFormChange('duration_months', e.target.value)}
                  placeholder="مثال: 12"
                />
                {form.duration_months > 0 && durationErrorPreview && (
                  <p className="text-xs text-warning mt-1">
                    ⚠ {durationErrorPreview}
                  </p>
                )}
              </FormField>
            )}
            {!form.is_open && (
              <FormField label="تاريخ النهاية">
                <DateInput value={form.end_date} readOnly className="bg-muted cursor-not-allowed" />
              </FormField>
            )}
            {form.is_open && (
              <div className="sm:col-span-2 p-3 rounded-xl border border-info/30 bg-info/5">
                <p className="text-sm text-info font-medium">✓ عقد مفتوح - لا يوجد تاريخ انتهاء</p>
                <p className="text-xs text-muted-foreground mt-1">سينتهي العقد فقط عند تغيير نوعه أو إنهائه يدوياً</p>
              </div>
            )}
            <FormField label="فترة الدفع" required>
              <Select value={form.payment_interval} onValueChange={v => onFormChange('payment_interval', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(INTERVAL_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="السعر الشهري (جنيه)" required error={formErrors.monthly_rate}>
              <Input
                type="number"
                value={form.monthly_rate}
                onChange={e => onFormChange('monthly_rate', e.target.value)}
                placeholder="سعر الشهر الواحد"
              />
              <p className="text-xs text-muted-foreground mt-1">
                مثال: 100 جنيه في الشهر × {form.duration_months || '?'} شهر = {form.total_value ? formatCurrency(parseFloat(form.total_value)).replace('جنيه', '').trim() + ' جنيه' : '?'}
              </p>
            </FormField>
            {monthlyRate > 0 && form.duration_months > 0 && !form.is_open && (
              <FormField label={`قيمة الدفعة (${INTERVAL_LABELS[form.payment_interval].split('(')[0].trim()})`}>
                <div className="h-10 px-3 flex items-center bg-muted/50 rounded-lg border border-border text-sm">
                  <span className="font-bold text-success">
                    {formatCurrency(perPeriodAmount)}
                  </span>
                  <span className="text-muted-foreground ms-2 text-xs">
                    كل {intervalMonths} {intervalMonths === 1 ? 'شهر' : intervalMonths === 3 ? 'أشهر' : intervalMonths === 6 ? 'أشهر' : 'شهر'}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  عدد الدفعات: {Math.ceil(parseInt(form.duration_months) / intervalMonths)} دفعة
                </p>
              </FormField>
            )}
            {!form.is_open && (
              <FormField label="القيمة الإجمالية">
                <Input type="number" value={form.total_value} readOnly className="bg-muted cursor-not-allowed font-bold text-lg" />
              </FormField>
            )}
            {form.is_open && (
              <FormField label="السعر للدفعة الواحدة">
                <div className="h-10 px-3 flex items-center bg-muted/50 rounded-lg border border-border text-sm">
                  <span className="font-bold text-success">
                    {formatCurrency(perPeriodAmount)}
                  </span>
                  <span className="text-muted-foreground ms-2 text-xs">
                    كل {intervalMonths} {intervalMonths === 1 ? 'شهر' : intervalMonths === 3 ? 'أشهر' : intervalMonths === 6 ? 'أشهر' : 'شهر'}
                  </span>
                </div>
              </FormField>
            )}
            <FormField label="ملاحظات" className="sm:col-span-2">
              <Textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} placeholder="ملاحظات اختيارية..." rows={3} />
            </FormField>
          </div>
          <DialogFooter className="justify-end">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>إلغاء</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'جاري الحفظ...' : 'إنشاء العقد'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quick Add Client Dialog */}
      <Dialog open={clientDialogOpen} onOpenChange={setClientDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>إضافة عميل جديد</DialogTitle></DialogHeader>
          <div className="p-6 space-y-4">
            <FormField label="الاسم" required><Input value={clientForm.name} onChange={e => setClientForm({...clientForm, name: e.target.value})} /></FormField>
            <FormField label="الهاتف"><Input value={clientForm.phone} onChange={e => setClientForm({...clientForm, phone: e.target.value})} dir="ltr" /></FormField>
          </div>
          <DialogFooter className="justify-end">
            <Button variant="outline" onClick={() => setClientDialogOpen(false)}>إلغاء</Button>
            <Button onClick={saveClient}>إضافة</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
