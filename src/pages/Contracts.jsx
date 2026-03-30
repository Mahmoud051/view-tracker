import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, Search, FileText, UserPlus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatDate, formatCurrency, calculateEndDate, rentalTypeLabels, safeNum, todayStr } from '@/lib/utils'
import { useToast } from '@/contexts/ToastContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Textarea } from '@/components/ui/index'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/index'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { PageHeader, StatusBadge, EmptyState, LoadingScreen, FormField } from '@/components/ui/shared'
import { Badge } from '@/components/ui/badge'

const EMPTY_FORM = {
  stand_id: '', client_id: '', rental_type: 'monthly',
  start_date: todayStr(), end_date: '', total_value: '', notes: '', status: 'active',
}
const EMPTY_CLIENT = { name: '', phone: '' }

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
      supabase.from('stands').select('id, code, address').order('code'),
      supabase.from('clients').select('id, name, phone').order('name'),
      supabase.from('payments').select('contract_id, amount'),
    ])
    setContracts(c || [])
    setStands(s || [])
    setClients(cl || [])
    const pm = {}
    ;(p || []).forEach(pay => { pm[pay.contract_id] = (pm[pay.contract_id] || 0) + safeNum(pay.amount) })
    setPaymentsMap(pm)
    setLoading(false)
  }

  const filtered = (contracts || []).filter(c => {
    const matchStatus = filter === 'all' || c.status === filter
    const matchSearch = !search ||
      c.stands?.code?.toLowerCase().includes(search.toLowerCase()) ||
      c.clients?.name?.toLowerCase().includes(search.toLowerCase())
    return matchStatus && matchSearch
  })

  function updateEndDate(startDate, rentalType) {
    const end = calculateEndDate(startDate, rentalType)
    setForm(f => ({ ...f, end_date: end }))
  }

  function validateForm() {
    const errs = {}
    if (!form.stand_id) errs.stand_id = 'اختر اللوحة'
    if (!form.client_id) errs.client_id = 'اختر العميل'
    if (!form.start_date) errs.start_date = 'تاريخ البداية مطلوب'
    if (!form.end_date) errs.end_date = 'تاريخ النهاية مطلوب'
    if (!form.total_value || isNaN(form.total_value)) errs.total_value = 'قيمة العقد مطلوبة'
    setFormErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function handleSave() {
    if (!validateForm()) return
    setSaving(true)
    try {
      // Check if stand has active contract
      const { data: existing } = await supabase
        .from('contracts')
        .select('id')
        .eq('stand_id', form.stand_id)
        .eq('status', 'active')
        .limit(1)

      let status = form.status
      if (existing && existing.length > 0) status = 'upcoming'
      else {
        const today = new Date().toISOString().split('T')[0]
        if (form.start_date > today) status = 'upcoming'
      }

      const { error } = await supabase.from('contracts').insert([{
        stand_id: form.stand_id,
        client_id: form.client_id,
        rental_type: form.rental_type,
        start_date: form.start_date,
        end_date: form.end_date,
        total_value: parseFloat(form.total_value),
        status,
        notes: form.notes || null,
      }])
      if (error) throw error
      toast({ title: 'تم الحفظ', description: `تم إنشاء العقد بحالة: ${status === 'upcoming' ? 'قادم' : 'نشط'}`, variant: 'success' })
      setDialogOpen(false)
      setForm(EMPTY_FORM)
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
                  <TableHead>اللوحة</TableHead>
                  <TableHead>العميل</TableHead>
                  <TableHead>النوع</TableHead>
                  <TableHead>البداية</TableHead>
                  <TableHead>النهاية</TableHead>
                  <TableHead>القيمة</TableHead>
                  <TableHead>المدفوع</TableHead>
                  <TableHead>المتبقي</TableHead>
                  <TableHead>الحالة</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(c => {
                  const paid = paymentsMap[c.id] || 0
                  const rem = safeNum(c.total_value) - paid
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
                      <TableCell className="text-sm">{rentalTypeLabels[c.rental_type]}</TableCell>
                      <TableCell className="text-sm">{formatDate(c.start_date)}</TableCell>
                      <TableCell className="text-sm">{formatDate(c.end_date)}</TableCell>
                      <TableCell className="text-sm font-medium">{formatCurrency(c.total_value)}</TableCell>
                      <TableCell className="text-sm text-success">{formatCurrency(paid)}</TableCell>
                      <TableCell className={`text-sm font-medium ${rem > 0 ? 'text-destructive' : 'text-success'}`}>{formatCurrency(rem)}</TableCell>
                      <TableCell><StatusBadge status={c.status} /></TableCell>
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
            <FormField label="اللوحة الإعلانية" required error={formErrors.stand_id}>
              <Select value={form.stand_id} onValueChange={v => setForm({...form, stand_id: v})}>
                <SelectTrigger><SelectValue placeholder="اختر اللوحة" /></SelectTrigger>
                <SelectContent>
                  {stands.map(s => <SelectItem key={s.id} value={s.id}>{s.code} — {s.address?.slice(0,30)}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="العميل" required error={formErrors.client_id}>
              <div className="flex gap-2">
                <Select value={form.client_id} onValueChange={v => setForm({...form, client_id: v})}>
                  <SelectTrigger className="flex-1"><SelectValue placeholder="اختر العميل" /></SelectTrigger>
                  <SelectContent>
                    {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button size="icon" variant="outline" onClick={() => setClientDialogOpen(true)} title="إضافة عميل جديد">
                  <UserPlus className="w-4 h-4" />
                </Button>
              </div>
            </FormField>
            <FormField label="نوع الإيجار">
              <Select value={form.rental_type} onValueChange={v => { setForm({...form, rental_type: v}); updateEndDate(form.start_date, v) }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">شهري</SelectItem>
                  <SelectItem value="quarterly">ربع سنوي</SelectItem>
                  <SelectItem value="semi_annual">نصف سنوي</SelectItem>
                  <SelectItem value="annual">سنوي</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="قيمة العقد (جنيه)" required error={formErrors.total_value}>
              <Input type="number" value={form.total_value} onChange={e => setForm({...form, total_value: e.target.value})} placeholder="0" />
            </FormField>
            <FormField label="تاريخ البداية" required error={formErrors.start_date}>
              <Input type="date" value={form.start_date} onChange={e => { setForm({...form, start_date: e.target.value}); updateEndDate(e.target.value, form.rental_type) }} />
            </FormField>
            <FormField label="تاريخ النهاية" required error={formErrors.end_date}>
              <Input type="date" value={form.end_date} onChange={e => setForm({...form, end_date: e.target.value})} />
            </FormField>
            <FormField label="ملاحظات" className="sm:col-span-2">
              <Textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} placeholder="ملاحظات اختيارية..." rows={3} />
            </FormField>
          </div>
          <DialogFooter>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'جاري الحفظ...' : 'إنشاء العقد'}</Button>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>إلغاء</Button>
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
          <DialogFooter>
            <Button onClick={saveClient}>إضافة</Button>
            <Button variant="outline" onClick={() => setClientDialogOpen(false)}>إلغاء</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
