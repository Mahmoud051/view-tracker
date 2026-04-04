import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { Plus, Search, Building2, MapPin, Calendar, User, Ruler, Wallet, Maximize2, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cn, formatDate, formatCurrency, computeGovStatus, computeContractStatus, todayStr, safeNum, paymentIntervalMonths } from '@/lib/utils'
import { useToast } from '@/contexts/ToastContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DateInput } from '@/components/ui'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/index'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { PageHeader, StatusBadge, EmptyState, LoadingScreen, FormField } from '@/components/ui/shared'

const buildEmptyForm = () => ({
  code: '', address: '', width: '', height: '', sides: '1', desc: '',
  gov_license_number: '', gov_rental_start: todayStr(), gov_rental_end: '', gov_rental_cost: '',
})

const MEASUREMENT_INPUT_PATTERN = /^\d*\.?\d{0,2}$/
const MEASUREMENT_VALUE_PATTERN = /^\d+(\.\d{1,2})?$/

export default function Stands() {
  const [stands, setStands] = useState([])
  const [contracts, setContracts] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [showInactive, setShowInactive] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState(buildEmptyForm())
  const [formErrors, setFormErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [photoFile, setPhotoFile] = useState(null)
  const [paymentsMap, setPaymentsMap] = useState({})
  const [selectedImage, setSelectedImage] = useState(null)
  const navigate = useNavigate()
  const { toast } = useToast()

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    setLoading(true)
    const [{ data: s }, { data: c }, { data: pmts }] = await Promise.all([
      supabase.from('stands').select('*').order('created_at', { ascending: false }),
      supabase.from('contracts').select('id, stand_id, status, start_date, end_date, total_value, duration_months, payment_frequency, monthly_rate, is_open, clients(name, phone)').in('status', ['active', 'upcoming']),
      supabase.from('payments').select('contract_id, amount'),
    ])
    setStands(s || [])
    setContracts(c || [])
    const pm = {}
    ;(pmts || []).forEach(p => { pm[p.contract_id] = (pm[p.contract_id] || 0) + safeNum(p.amount) })
    setPaymentsMap(pm)
    setLoading(false)
  }

  const rentedIds = new Set((contracts || []).filter(c => computeContractStatus(c.start_date, c.end_date, c.status) === 'active').map(c => c.stand_id))

  const filtered = (stands || []).filter(s => {
    if (s.is_active === false && !showInactive) return false
    const matchSearch = !search ||
      s.code?.toLowerCase().includes(search.toLowerCase()) ||
      s.address?.toLowerCase().includes(search.toLowerCase())
    const standStatus = rentedIds.has(s.id) ? 'rented' : 'available'
    const matchStatus = statusFilter === 'all' || standStatus === statusFilter
    return matchSearch && matchStatus
  })

  function updateMeasurement(field, value) {
    if (!MEASUREMENT_INPUT_PATTERN.test(value)) return
    setForm(prev => ({ ...prev, [field]: value }))
  }

  function validateForm() {
    const errs = {}
    if (!form.code.trim()) errs.code = 'كود اللوحة مطلوب'
    if (!form.address.trim()) errs.address = 'العنوان مطلوب'
    if (!MEASUREMENT_VALUE_PATTERN.test(String(form.width).trim())) errs.width = 'أدخل رقمًا صحيحًا أو منزلتين عشريتين كحد أقصى مثل 1 أو 1.1 أو 1.23'
    if (!MEASUREMENT_VALUE_PATTERN.test(String(form.height).trim())) errs.height = 'أدخل رقمًا صحيحًا أو منزلتين عشريتين كحد أقصى مثل 2 أو 2.5 أو 2.75'
    setFormErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function handleSave() {
    if (!validateForm()) return
    setSaving(true)
    try {
      let photo_url = null
      if (photoFile) {
        const fileName = `${Date.now()}-${photoFile.name}`
        const { data: uploadData, error: upErr } = await supabase.storage
          .from('stand-photos')
          .upload(fileName, photoFile)
        if (!upErr && uploadData) {
          const { data: { publicUrl } } = supabase.storage.from('stand-photos').getPublicUrl(fileName)
          photo_url = publicUrl
        }
      }
      const govStatus = form.gov_rental_end ? computeGovStatus(form.gov_rental_end) : 'active'
      const { error } = await supabase.from('stands').insert([{
        code: form.code.trim(),
        address: form.address.trim(),
        photo_url,
        width: parseFloat(form.width),
        height: parseFloat(form.height),
        sides: parseInt(form.sides) || 1,
        desc: form.desc.trim() || null,
        gov_license_number: form.gov_license_number || null,
        gov_rental_start: form.gov_rental_start || null,
        gov_rental_end: form.gov_rental_end || null,
        gov_rental_cost: parseFloat(form.gov_rental_cost) || 0,
        gov_status: govStatus,
      }])
      if (error) throw error
      toast({ title: 'تم الحفظ', description: 'تم إضافة اللوحة بنجاح', variant: 'success' })
      setDialogOpen(false)
      setForm(buildEmptyForm())
      setPhotoFile(null)
      fetchData()
    } catch (err) {
      toast({ title: 'خطأ', description: err.message, variant: 'error' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <LoadingScreen />

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="اللوحات الإعلانية" description={`${stands.length} لوحة إجمالاً`}>
        <Button onClick={() => { setForm(buildEmptyForm()); setDialogOpen(true) }}>
          <Plus className="w-4 h-4" /> إضافة لوحة
        </Button>
      </PageHeader>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="بحث بالكود أو العنوان..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="ps-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="الحالة" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">جميع الحالات</SelectItem>
            <SelectItem value="available">متاح</SelectItem>
            <SelectItem value="rented">مؤجر</SelectItem>
          </SelectContent>
        </Select>
        <Button
          size="sm"
          variant={showInactive ? 'default' : 'outline'}
          onClick={() => setShowInactive(v => !v)}
          className="gap-1.5"
        >
          {showInactive ? 'إخفاء المتوقفة' : 'إظهار المتوقفة'}
        </Button>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="لا توجد لوحات"
          description="لم يتم العثور على لوحات تطابق بحثك"
          action={!search && <Button onClick={() => setDialogOpen(true)}><Plus className="w-4 h-4" /> إضافة لوحة</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map(stand => {
            const isRented = rentedIds.has(stand.id) || contracts.some(c => c.stand_id === stand.id && c.status === 'upcoming')
            const govSt = computeGovStatus(stand.gov_rental_end)
            const isInactive = stand.is_active === false
            return (
              <button
                key={stand.id}
                onClick={() => navigate(`/stands/${stand.id}`)}
                className="text-start bg-card border border-border rounded-2xl overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 card-hover group"
              >
                {/* Photo */}
                <div className="h-36 bg-muted relative overflow-hidden">
                  {stand.photo_url ? (
                    <img 
                      src={stand.photo_url} 
                      alt={stand.code} 
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation()
                        setSelectedImage({ url: stand.photo_url, code: stand.code })
                      }} 
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Building2 className="w-10 h-10 text-muted-foreground/40" />
                    </div>
                  )}
                  <div className="absolute top-2 start-2 flex items-center gap-1">
                    {!isInactive ? <StatusBadge status={isRented ? 'rented' : 'available'} /> : <span className="bg-muted text-muted-foreground border border-border text-xs px-2 py-0.5 rounded-full font-medium">متوقف</span>}
                  </div>
                  {govSt !== 'active' && (
                    <div className="absolute top-2 end-2">
                      <StatusBadge status={govSt} className="text-xs" />
                    </div>
                  )}
                  {stand.photo_url && (
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center pointer-events-none">
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 rounded-lg p-2 pointer-events-auto">
                        <Maximize2 className="w-5 h-5 text-white" />
                      </div>
                    </div>
                  )}
                </div>
                {/* Info */}
                <div className={cn('p-4 space-y-2', isInactive && 'opacity-60')}>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-bold text-foreground">{stand.code}</h3>
                    <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                      <Ruler className="w-3 h-3" />
                      {(stand.width * stand.height).toFixed(0)} م²
                    </span>
                  </div>
                  <div className="flex items-start gap-1.5 text-muted-foreground">
                    <MapPin className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    <p className="text-xs line-clamp-2">{stand.address}</p>
                  </div>
                  {(() => {
                    // Show active contract first, fall back to upcoming
                    const contract = contracts.find(c => c.stand_id === stand.id && computeContractStatus(c.start_date, c.end_date, c.status) === 'active')
                      || contracts.find(c => c.stand_id === stand.id)
                    if (!contract) {
                      return (
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <User className="w-3.5 h-3.5 flex-shrink-0" />
                          <p className="text-xs text-muted-foreground">— غير مؤجرة</p>
                        </div>
                      )
                    }
                    const daysLeft = contract.end_date ? Math.ceil((new Date(contract.end_date) - new Date()) / 86400000) : null
                    
                    // Calculate period due amount
                    let periodDue = 0
                    const contractStatus = computeContractStatus(contract.start_date, contract.end_date, contract.status)
                    if (contract.start_date && contractStatus !== 'upcoming') {
                      const now = new Date()
                      const start = new Date(contract.start_date)
                      const paymentFreq = contract.payment_frequency || 'monthly'
                      const intervalMonths = paymentIntervalMonths[paymentFreq] || 1
                      const monthlyRate = safeNum(contract.monthly_rate) || (safeNum(contract.total_value) / (parseInt(contract.duration_months) || 1))
                      const periodRate = monthlyRate * intervalMonths

                      // Cap at end_date for terminated/expired contracts
                      const end = contract.end_date ? new Date(contract.end_date) : null
                      const nowCapped = (end && now > end) ? end : now

                      const rawMonths = (nowCapped.getFullYear() - start.getFullYear()) * 12 + (nowCapped.getMonth() - start.getMonth())
                      const completeMonths = nowCapped.getDate() >= start.getDate() ? rawMonths + 1 : rawMonths

                      let periodsDue
                      if (contract.is_open) {
                        periodsDue = Math.ceil(completeMonths / intervalMonths)
                      } else {
                        const totalPeriods = Math.ceil((parseInt(contract.duration_months) || 1) / intervalMonths)
                        periodsDue = Math.min(Math.ceil(completeMonths / intervalMonths), totalPeriods)
                      }
                      const paid = paymentsMap[contract.id] || 0
                      periodDue = Math.max(0, periodsDue * periodRate - paid)
                    }
                    
                    return (
                      <>
                        <div className="flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 flex-shrink-0 text-primary" />
                          <p className="text-xs font-medium text-primary">{contract.clients?.name || '—'}</p>
                          {contract.status === 'upcoming' && <span className="text-xs bg-info/15 text-info px-1.5 py-0.5 rounded-full">قادم</span>}
                        </div>
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Calendar className="w-3.5 h-3.5 flex-shrink-0" />
                          <p className="text-xs">ينتهي: {formatDate(contract.end_date)}</p>
                          {daysLeft !== null && daysLeft > 0 && (
                            <span className={cn('text-xs font-medium px-1.5 py-0.5 rounded-full', daysLeft <= 30 ? 'bg-destructive/15 text-destructive' : daysLeft <= 90 ? 'bg-warning/15 text-warning' : 'bg-success/15 text-success')}>
                              {daysLeft} يوم
                            </span>
                          )}
                        </div>
                        {periodDue > 0 && (
                          <div className="flex items-center gap-1.5">
                            <Wallet className="w-3.5 h-3.5 flex-shrink-0 text-destructive" />
                            <p className="text-xs font-medium text-destructive">مستحق: {formatCurrency(periodDue)}</p>
                          </div>
                        )}
                      </>
                    )
                  })()}
                  {stand.gov_rental_end && (
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Calendar className="w-3.5 h-3.5 flex-shrink-0" />
                      <p className="text-xs">
                        ترخيص: {formatDate(stand.gov_rental_end)}
                        {(() => { const gd = Math.ceil((new Date(stand.gov_rental_end) - new Date()) / 86400000); return gd > 0 && gd <= 90 ? ` (${gd} يوم)` : '' })()}
                      </p>
                    </div>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* Add Stand Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>إضافة لوحة إعلانية جديدة</DialogTitle>
          </DialogHeader>
          <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[60vh] overflow-y-auto">
            <FormField label="كود اللوحة" required error={formErrors.code}>
              <Input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="مثال: BD-001" />
            </FormField>
            <FormField label="العنوان" required error={formErrors.address} className="sm:col-span-2">
              <Input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="العنوان الكامل للموقع" />
            </FormField>
            <FormField label="الطول (متر)" required error={formErrors.width}>
              <Input type="text" inputMode="decimal" value={form.width} onChange={e => updateMeasurement('width', e.target.value)} placeholder="0" />
            </FormField>
            <FormField label="العرض (متر)" required error={formErrors.height}>
              <Input type="text" inputMode="decimal" value={form.height} onChange={e => updateMeasurement('height', e.target.value)} placeholder="0" />
            </FormField>
            <FormField label="عدد الأوجه">
              <Select value={form.sides} onValueChange={v => setForm({ ...form, sides: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">وجه واحد</SelectItem>
                  <SelectItem value="2">وجهين</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="الوصف" className="sm:col-span-2">
              <Textarea value={form.desc} onChange={e => setForm({ ...form, desc: e.target.value })} placeholder="وصف اللوحة والموقع..." />
            </FormField>
            <FormField label="صورة اللوحة" className="sm:col-span-2">
              <Input type="file" accept="image/*" onChange={e => setPhotoFile(e.target.files[0])} />
            </FormField>
            <div className="sm:col-span-2 pt-2 border-t border-border">
              <p className="text-sm font-semibold text-muted-foreground mb-3">بيانات الترخيص الحكومي</p>
            </div>
            <FormField label="رقم الترخيص الحكومي">
              <Input value={form.gov_license_number} onChange={e => setForm({ ...form, gov_license_number: e.target.value })} />
            </FormField>
            <FormField label="تكلفة الإيجار الحكومي (جنيه)">
              <Input type="number" value={form.gov_rental_cost} onChange={e => setForm({ ...form, gov_rental_cost: e.target.value })} placeholder="0" />
            </FormField>
            <FormField label="تاريخ بداية الترخيص">
              <DateInput
                value={form.gov_rental_start}
                onChange={e => setForm(prev => ({ ...prev, gov_rental_start: e.target.value }))}
                placeholder="اختر التاريخ"
              />
            </FormField>
            <FormField label="تاريخ انتهاء الترخيص">
              <DateInput
                value={form.gov_rental_end}
                onChange={e => setForm(prev => ({ ...prev, gov_rental_end: e.target.value }))}
                placeholder="اختر التاريخ"
              />
            </FormField>
          </div>
          <DialogFooter className="justify-end">
            <Button variant="outline" onClick={() => { setForm(buildEmptyForm()); setDialogOpen(false) }}>إلغاء</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'جاري الحفظ...' : 'حفظ اللوحة'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Image Preview Modal */}
      <Dialog open={!!selectedImage} onOpenChange={() => setSelectedImage(null)}>
        <DialogContent className="max-w-5xl w-[95vw] p-0 overflow-hidden">
          <DialogPrimitive.Title className="sr-only">صورة اللوحة - {selectedImage?.code}</DialogPrimitive.Title>
          <div className="relative bg-gradient-to-b from-card to-card/95 border-b border-border px-6 py-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-foreground">صورة اللوحة</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                {selectedImage?.code}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSelectedImage(null)}
              className="text-muted-foreground hover:text-foreground hover:bg-muted/80 rounded-lg"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>
          <div className="relative bg-black/5">
            <img 
              src={selectedImage?.url} 
              alt={selectedImage?.code} 
              className="w-full h-auto max-h-[80vh] object-contain" 
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
