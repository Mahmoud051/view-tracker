import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
   Edit2, Save, X, Plus, Trash2, Building2, MapPin,
  Ruler, Clock, FileText, DollarSign, Wrench, PlayCircle,
  ToggleLeft, ToggleRight, Image as ImageIcon, Shield, ScrollText, BarChart3, History, Users, ChevronRight
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatDate, formatCurrency, computeGovStatus, computeContractStatus, safeNum, cn, toLocalDateStr } from '@/lib/utils'
import { useToast } from '@/contexts/ToastContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DateInput } from '@/components/ui'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/index'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/index'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Textarea } from '@/components/ui/index'
import { LoadingScreen, StatusBadge, FormField, ConfirmDialog, StatCard } from '@/components/ui/shared'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { subMonths } from 'date-fns'

export default function StandDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { toast } = useToast()

  const [stand, setStand] = useState(null)
  const [contracts, setContracts] = useState([])
  const [maintenance, setMaintenance] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingInfo, setEditingInfo] = useState(false)
  const [editingGov, setEditingGov] = useState(false)
  const [infoForm, setInfoForm] = useState({})
  const [govForm, setGovForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [maintDialogOpen, setMaintDialogOpen] = useState(false)
  const [maintForm, setMaintForm] = useState({ date: '', description: '', cost: '', technician_name: '', is_paid: false })
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [photoFile, setPhotoFile] = useState(null)
  const [editingMaintId, setEditingMaintId] = useState(null)
  const [editingMaintForm, setEditingMaintForm] = useState({ date: '', description: '', cost: '', technician_name: '', is_paid: false })

  useEffect(() => { fetchAll() }, [id])

  async function fetchAll() {
    setLoading(true)
    const [{ data: s }, { data: c }, { data: m }] = await Promise.all([
      supabase.from('stands').select('*').eq('id', id).single(),
      supabase.from('contracts').select('*, clients(id, name, phone), payments(*)').eq('stand_id', id).order('created_at', { ascending: false }),
      supabase.from('maintenance_records').select('*').eq('stand_id', id).order('date', { ascending: false }),
    ])
    setStand(s)
    setInfoForm({ code: s?.code || '', address: s?.address || '', width: s?.width || '', height: s?.height || '', sides: s?.sides || 1, desc: s?.desc || '' })
    setGovForm({
      gov_license_number: s?.gov_license_number || '',
      gov_rental_start: s?.gov_rental_start || '',
      gov_rental_end: s?.gov_rental_end || '',
      gov_rental_cost: s?.gov_rental_cost || '',
    })
    setContracts(c || [])
    setMaintenance(m || [])
    setLoading(false)
  }

  const activeContract = contracts.find(c => computeContractStatus(c.start_date, c.end_date, c.status) === 'active')
  const upcomingContracts = contracts.filter(c => c.status === 'upcoming')

  // Payments per contract
  function contractPaid(c) {
    return (c.payments || []).reduce((a, p) => a + safeNum(p.amount), 0)
  }

  // periodDue for active contract
  const periodDue = (() => {
    if (!activeContract || !activeContract.start_date || !activeContract.payment_frequency) return 0
    const INTERVAL_MONTHS = { monthly: 1, quarterly: 3, semi_annual: 6, annual: 12 }
    const now = new Date()
    const start = new Date(activeContract.start_date)
    const end = activeContract.end_date ? new Date(activeContract.end_date) : null
    const nowCapped = end && now > end ? end : now
    const monthlyRate = safeNum(activeContract.total_value) / (parseInt(activeContract.duration_months) || 1)
    const intervalMonths = INTERVAL_MONTHS[activeContract.payment_frequency] || 1
    const periodRate = monthlyRate * intervalMonths
    const paid = contractPaid(activeContract)
    const rawMonths = (nowCapped.getFullYear() - start.getFullYear()) * 12 + (nowCapped.getMonth() - start.getMonth())
    const completeMonths = nowCapped.getDate() >= start.getDate() ? rawMonths + 1 : rawMonths
    const totalPeriods = Math.ceil((parseInt(activeContract.duration_months) || 1) / intervalMonths)
    const periodsDue = Math.min(Math.ceil(completeMonths / intervalMonths), totalPeriods)
    return Math.max(0, periodsDue * periodRate - paid)
  })()

  // Last 6 months maintenance cost
  const sixMonthsAgo = subMonths(new Date(), 6)
  const recentMaintCost = maintenance
    .filter(m => m.date && new Date(m.date) >= sixMonthsAgo)
    .reduce((a, m) => a + safeNum(m.cost), 0)

  // Last 6 months revenue (from payments on contracts)
  const allPayments = contracts.flatMap(c => (c.payments || []).map(p => ({ ...p })))
  const recentRevenue = allPayments
    .filter(p => p.payment_date && new Date(p.payment_date) >= sixMonthsAgo)
    .reduce((a, p) => a + safeNum(p.amount), 0)

  async function saveInfo() {
    setSaving(true)
    try {
      let updates = {
        code: infoForm.code,
        address: infoForm.address,
        width: parseFloat(infoForm.width),
        height: parseFloat(infoForm.height),
        sides: parseInt(infoForm.sides) || 1,
        desc: infoForm.desc?.trim() || null,
      }
      if (photoFile) {
        const fileName = `${Date.now()}-${photoFile.name}`
        const { data: up } = await supabase.storage.from('stand-photos').upload(fileName, photoFile)
        if (up) {
          const { data: { publicUrl } } = supabase.storage.from('stand-photos').getPublicUrl(fileName)
          updates.photo_url = publicUrl
        }
      }
      const { error } = await supabase.from('stands').update(updates).eq('id', id)
      if (error) throw error
      toast({ title: 'تم الحفظ', description: 'تم تحديث بيانات اللوحة', variant: 'success' })
      setEditingInfo(false)
      fetchAll()
    } catch (e) { toast({ title: 'خطأ', description: e.message, variant: 'error' }) }
    setSaving(false)
  }

  async function saveGov() {
    setSaving(true)
    try {
      const govStatus = govForm.gov_rental_end ? computeGovStatus(govForm.gov_rental_end) : 'active'
      const { error } = await supabase.from('stands').update({
        gov_license_number: govForm.gov_license_number || null,
        gov_rental_start: govForm.gov_rental_start || null,
        gov_rental_end: govForm.gov_rental_end || null,
        gov_rental_cost: parseFloat(govForm.gov_rental_cost) || 0,
        gov_status: govStatus,
      }).eq('id', id)
      if (error) throw error
      toast({ title: 'تم الحفظ', description: 'تم تحديث بيانات الترخيص', variant: 'success' })
      setEditingGov(false)
      fetchAll()
    } catch (e) { toast({ title: 'خطأ', description: e.message, variant: 'error' }) }
    setSaving(false)
  }

  async function saveMaint() {
    if (!maintForm.description.trim()) { toast({ title: 'خطأ', description: 'وصف الصيانة مطلوب', variant: 'error' }); return }
    setSaving(true)
    try {
      const { error } = await supabase.from('maintenance_records').insert([{
        stand_id: id,
        date: maintForm.date || toLocalDateStr(new Date()),
        description: maintForm.description,
        cost: parseFloat(maintForm.cost) || 0,
        technician_name: maintForm.technician_name || null,
        is_paid: maintForm.is_paid,
      }])
      if (error) throw error
      toast({ title: 'تم الحفظ', description: 'تم إضافة سجل الصيانة', variant: 'success' })
      setMaintDialogOpen(false)
      setMaintForm({ date: '', description: '', cost: '', technician_name: '', is_paid: false })
      fetchAll()
    } catch (e) { toast({ title: 'خطأ', description: e.message, variant: 'error' }) }
    setSaving(false)
  }

  async function deleteMaint(mId) {
    await supabase.from('maintenance_records').delete().eq('id', mId)
    toast({ title: 'تم الحذف', variant: 'success' })
    setDeleteConfirm(null)
    fetchAll()
  }

  async function toggleMaintPaid(m) {
    await supabase.from('maintenance_records').update({ is_paid: !m.is_paid }).eq('id', m.id)
    fetchAll()
  }

  async function toggleStandActive() {
    const newActive = !(stand.is_active === true ? true : false)
    const { error } = await supabase.from('stands').update({ is_active: newActive }).eq('id', id)
    if (!error) {
      toast({ title: newActive ? 'تم تفعيل اللوحة' : 'تم إيقاف اللوحة', variant: 'success' })
      fetchAll()
    } else {
      toast({ title: 'خطأ', description: error.message, variant: 'error' })
    }
  }

  function openEditMaint(m) {
    setEditingMaintId(m.id)
    setEditingMaintForm({
      date: m.date || '',
      description: m.description || '',
      cost: m.cost || '',
      technician_name: m.technician_name || '',
      is_paid: m.is_paid || false,
    })
  }

  async function saveEditedMaint() {
    if (!editingMaintForm.description.trim()) { toast({ title: 'خطأ', description: 'وصف الصيانة مطلوب', variant: 'error' }); return }
    setSaving(true)
    try {
      const { error } = await supabase.from('maintenance_records').update({
        date: editingMaintForm.date || null,
        description: editingMaintForm.description,
        cost: parseFloat(editingMaintForm.cost) || 0,
        technician_name: editingMaintForm.technician_name || null,
        is_paid: editingMaintForm.is_paid,
      }).eq('id', editingMaintId)
      if (error) throw error
      toast({ title: 'تم التحديث', description: 'تم تحديث سجل الصيانة', variant: 'success' })
      setEditingMaintId(null)
      setEditingMaintForm({ date: '', description: '', cost: '', technician_name: '', is_paid: false })
      fetchAll()
    } catch (e) { toast({ title: 'خطأ', description: e.message, variant: 'error' }) }
    setSaving(false)
  }

  if (loading) return <LoadingScreen />
  if (!stand) return <div className="p-8 text-center text-muted-foreground">اللوحة غير موجودة</div>

  const govStatus = computeGovStatus(stand.gov_rental_end)
  const isRented = !!activeContract
  const isStandActive = stand.is_active !== false

  return (
    <div dir="rtl" className={cn('space-y-6 animate-fade-in', !isStandActive && 'opacity-75')}>

      {/* ── Hero Header ─────────────────────────────────────── */}
      <div className="relative rounded-2xl overflow-hidden border border-border shadow-sm">
        {stand.photo_url ? (
          <div
            className="h-44 sm:h-52 bg-cover bg-center relative"
            style={{ backgroundImage: `url(${stand.photo_url})` }}
          >
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-black/20" />
          </div>
        ) : (
          <div className="h-28 bg-gradient-to-br from-primary/15 via-primary/5 to-transparent border-b border-border/60" />
        )}

        <div className="relative -mt-14 px-6 pb-5 flex flex-col sm:flex-row sm:items-end gap-4">
          <div className="w-20 h-20 rounded-2xl border-4 border-background bg-card text-primary flex items-center justify-center shadow-lg flex-shrink-0">
            <Building2 className="w-9 h-9" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h1 className="text-2xl sm:text-3xl font-black text-foreground">{stand.code}</h1>
              {!isStandActive && <Badge variant="muted" className="text-xs">متوقف</Badge>}
              <StatusBadge status={isRented ? 'rented' : 'available'} />
              <StatusBadge status={govStatus} />
            </div>
            <p className="text-sm text-muted-foreground flex items-center gap-1.5 text-right">
              <MapPin className="w-3.5 h-3.5 flex-shrink-0 text-primary" />
              <span className="truncate">{stand.address}</span>
            </p>
          </div>

          <Button
            size="sm"
            variant={isStandActive ? 'outline' : 'default'}
            onClick={toggleStandActive}
            className={cn(
              'gap-2 flex-shrink-0 font-medium shadow-sm',
              isStandActive
                ? 'border-muted text-muted-foreground hover:bg-destructive/10 hover:border-destructive/40 hover:text-destructive'
                : 'bg-success hover:bg-success/90 text-white'
            )}
          >
            {isStandActive
              ? <><ToggleRight className="w-4 h-4" /> إيقاف</>
              : <><ToggleLeft className="w-4 h-4" /> تفعيل</>}
          </Button>
        </div>

        {/* Stats ribbon */}
        <div className="px-6 pb-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'الأبعاد', value: `${safeNum(stand.width)} × ${safeNum(stand.height)} م`, icon: Ruler, color: 'text-primary' },
            { label: 'المساحة', value: `${safeNum(stand.width) * safeNum(stand.height)} م²`, icon: Building2, color: 'text-info' },
            { label: 'الأوجه', value: stand.sides == 2 ? 'وجهين' : 'وجه واحد', icon: FileText, color: 'text-warning' },
            { label: 'مستحق الآن', value: formatCurrency(periodDue), icon: DollarSign, color: periodDue > 0 ? 'text-destructive' : 'text-success' },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="flex items-center gap-3 bg-muted/60 rounded-xl px-4 py-3 border border-border/60 text-right">
              <Icon className={cn('w-5 h-5 flex-shrink-0', color)} />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground leading-tight">{label}</p>
                <p className={cn('text-sm font-bold leading-tight truncate', color)}>{value}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Tab Navigation ──────────────────────────────────── */}
      <div className="bg-card rounded-2xl border border-border shadow-sm px-3 py-2">
        <Tabs defaultValue="info">
          <TabsList className="w-full h-auto gap-1 bg-transparent flex-wrap justify-start">
            {[
              { value: 'info',        label: 'المعلومات',       icon: Building2 },
              { value: 'gov',        label: 'الترخيص',          icon: Shield },
              { value: 'contract',   label: 'العقد الحالي',     icon: FileText },
              { value: 'history',    label: 'سجل العقود',       icon: History },
              { value: 'maintenance', label: 'الصيانة',          icon: Wrench },
              { value: 'revenue',     label: 'الإيرادات',         icon: BarChart3 },
            ].map(({ value, label, icon: Icon }) => (
              <TabsTrigger
                key={value}
                value={value}
                className="gap-2 text-sm data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none font-medium px-3 py-2 rounded-xl transition-colors"
              >
                <Icon className="w-4 h-4" />
                {label}
              </TabsTrigger>
            ))}
          </TabsList>

        {/* Tab: Basic Info */}
        <TabsContent value="info" className="mt-6 space-y-4">
          <Card className="overflow-hidden">
            <div className="h-px bg-gradient-to-r from-primary/30 via-primary/10 to-transparent" />
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div className="flex flex-reverse items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Building2 className="w-4 h-4 text-primary" />
                </div>
                <CardTitle className="text-base">المعلومات الأساسية</CardTitle>
              </div>
              {!editingInfo ? (
                <Button size="sm" variant="ghost" onClick={() => setEditingInfo(true)} className="gap-2 text-primary hover:text-primary">
                  <Edit2 className="w-4 h-4" /> تعديل
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button size="sm" onClick={saveInfo} disabled={saving} className="gap-1"><Save className="w-4 h-4" /> حفظ</Button>
                  <Button size="sm" variant="outline" onClick={() => setEditingInfo(false)}><X className="w-4 h-4" /></Button>
                </div>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              {stand.photo_url && !editingInfo && (
                <div className="relative rounded-xl overflow-hidden border border-border group">
                  <img src={stand.photo_url} alt={stand.code} className="w-full h-56 object-cover" />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                    <ImageIcon className="w-8 h-8 text-white opacity-0 group-hover:opacity-80 transition-opacity" />
                  </div>
                </div>
              )}
              {editingInfo ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField label="كود اللوحة"><Input value={infoForm.code} onChange={e => setInfoForm({...infoForm, code: e.target.value})} /></FormField>
                  <FormField label="العنوان" className="sm:col-span-2"><Input value={infoForm.address} onChange={e => setInfoForm({...infoForm, address: e.target.value})} /></FormField>
                  <FormField label="الوصف" className="sm:col-span-2"><Textarea value={infoForm.desc} onChange={e => setInfoForm({...infoForm, desc: e.target.value})} placeholder="وصف اللوحة والموقع..." /></FormField>
                  <FormField label="الطول (م)"><Input type="number" value={infoForm.width} onChange={e => setInfoForm({...infoForm, width: e.target.value})} /></FormField>
                  <FormField label="العرض (م)"><Input type="number" value={infoForm.height} onChange={e => setInfoForm({...infoForm, height: e.target.value})} /></FormField>
                  <FormField label="عدد الأوجه">
                    <Select value={String(infoForm.sides)} onValueChange={v => setInfoForm({...infoForm, sides: parseInt(v)})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">وجه واحد</SelectItem>
                        <SelectItem value="2">وجهين</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormField>
                  <FormField label="صورة جديدة" className="sm:col-span-2"><Input type="file" accept="image/*" onChange={e => setPhotoFile(e.target.files[0])} /></FormField>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {[
                    ['الكود', stand.code, 'text-primary font-black text-lg'],
                    ['الطول', `${stand.width} م`, 'text-foreground'],
                    ['العرض', `${stand.height} م`, 'text-foreground'],
                    ['المساحة', `${safeNum(stand.width) * safeNum(stand.height)} م²`, 'text-info font-bold'],
                    ['الأوجه', stand.sides == 2 ? 'وجهين' : 'وجه واحد', 'text-warning font-bold'],
                  ].map(([k, v, cls]) => (
                    <div key={k} className="bg-muted/50 rounded-xl px-4 py-3 border border-border/60">
                      <p className="text-xs text-muted-foreground mb-1">{k}</p>
                      <p className={cn('font-bold', cls)}>{v}</p>
                    </div>
                  ))}
                </div>
              )}
              {stand.desc && !editingInfo && (
                <div className="border-t border-border/60 pt-4">
                  <p className="text-xs text-muted-foreground mb-2 font-medium">الوصف</p>
                  <p className="text-sm text-foreground whitespace-pre-wrap bg-muted/40 rounded-xl px-4 py-3 border border-border/60">{stand.desc}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Gov Permit */}
        <TabsContent value="gov" className="mt-6">
          <Card className="overflow-hidden">
            <div className="h-px bg-gradient-to-r from-warning/40 via-warning/10 to-transparent" />
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div className="flex flex-reverse items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-warning/10 flex items-center justify-center">
                  <Shield className="w-4 h-4 text-warning" />
                </div>
                <CardTitle className="text-base">الترخيص الحكومي</CardTitle>
              </div>
              {!editingGov ? (
                <Button size="sm" variant="ghost" onClick={() => setEditingGov(true)} className="gap-2 text-warning hover:text-warning">
                  <Edit2 className="w-4 h-4" /> تعديل
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button size="sm" onClick={saveGov} disabled={saving} className="gap-1"><Save className="w-4 h-4" /> حفظ</Button>
                  <Button size="sm" variant="outline" onClick={() => setEditingGov(false)}><X className="w-4 h-4" /></Button>
                </div>
              )}
            </CardHeader>
            <CardContent>
              {editingGov ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField label="رقم الترخيص" className="sm:col-span-2"><Input value={govForm.gov_license_number} onChange={e => setGovForm({...govForm, gov_license_number: e.target.value})} /></FormField>
                  <FormField label="تاريخ البداية"><DateInput value={govForm.gov_rental_start} onChange={e => setGovForm({...govForm, gov_rental_start: e.target.value})} /></FormField>
                  <FormField label="تاريخ الانتهاء"><DateInput value={govForm.gov_rental_end} onChange={e => setGovForm({...govForm, gov_rental_end: e.target.value})} /></FormField>
                  <FormField label="التكلفة (جنيه)"><Input type="number" value={govForm.gov_rental_cost} onChange={e => setGovForm({...govForm, gov_rental_cost: e.target.value})} /></FormField>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {[
                    ['رقم الترخيص', stand.gov_license_number || '—', 'text-foreground'],
                    ['تاريخ البداية', formatDate(stand.gov_rental_start), 'text-foreground'],
                    ['تاريخ الانتهاء', formatDate(stand.gov_rental_end), stand.gov_rental_end && new Date(stand.gov_rental_end) < new Date() ? 'text-destructive font-bold' : 'text-foreground'],
                    ['التكلفة', formatCurrency(stand.gov_rental_cost), 'text-success font-bold'],
                  ].map(([k, v, cls]) => (
                    <div key={k} className="bg-muted/50 rounded-xl px-4 py-3 border border-border/60">
                      <p className="text-xs text-muted-foreground mb-1">{k}</p>
                      <p className={cn('font-bold text-sm', cls)}>{v}</p>
                    </div>
                  ))}
                  <div className="bg-muted/50 rounded-xl px-4 py-3 border border-border/60">
                    <p className="text-xs text-muted-foreground mb-1">الحالة</p>
                    <p className="mt-0.5"><StatusBadge status={govStatus} /></p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Active Contract */}
        <TabsContent value="contract" className="mt-6 space-y-4">
          {!activeContract ? (
            <Card>
              <CardContent className="py-16 text-center">
                <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
                  <FileText className="w-8 h-8 text-muted-foreground/40" />
                </div>
                <p className="text-muted-foreground mb-5 font-medium">لا يوجد عقد نشط لهذه اللوحة</p>
                <Button onClick={() => navigate(`/contracts?stand=${id}`)} className="gap-2">
                  <Plus className="w-4 h-4" /> إنشاء عقد جديد
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              <Card className="overflow-hidden">
                <div className="h-px bg-gradient-to-r from-success/40 via-success/10 to-transparent" />
                <CardHeader className="pb-2">
                  <div className="flex flex-reverse items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-success/10 flex items-center justify-center">
                      <FileText className="w-4 h-4 text-success" />
                    </div>
                    <CardTitle className="text-base">العقد الحالي</CardTitle>
                    <StatusBadge status="active" />
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Client banner */}
                  <div className="bg-primary/5 rounded-xl px-4 py-3 mb-5 flex items-center gap-3 border border-primary/15 text-right">
                    <div className="w-10 h-10 rounded-full bg-primary/15 text-primary flex items-center justify-center font-black text-lg flex-shrink-0">
                      {activeContract.clients?.name?.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-foreground">{activeContract.clients?.name}</p>
                      <p className="text-xs text-muted-foreground">{activeContract.clients?.phone}</p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => navigate(`/contracts/${activeContract.id}`)} className="gap-1 text-xs flex-row-reverse">
                      التفاصيل <ChevronRight className="w-3 h-3" />
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      ['تاريخ البداية', formatDate(activeContract.start_date), 'text-foreground'],
                      ['تاريخ الانتهاء', formatDate(activeContract.end_date), activeContract.end_date && new Date(activeContract.end_date) < new Date() ? 'text-destructive' : 'text-foreground'],
                      ['قيمة العقد', formatCurrency(activeContract.total_value), 'text-primary font-black'],
                      ['المدفوع', formatCurrency(contractPaid(activeContract)), 'text-success font-bold'],
                      ['مستحق الآن', formatCurrency(periodDue), periodDue > 0 ? 'text-destructive font-black' : 'text-success font-bold'],
                      ['مدة العقد', `${activeContract.duration_months || '—'} شهر`, 'text-foreground'],
                    ].map(([k, v, cls]) => (
                      <div key={k} className="bg-muted/50 rounded-xl px-4 py-3 border border-border/60">
                        <p className="text-xs text-muted-foreground mb-1">{k}</p>
                        <p className={cn('font-bold text-sm', cls)}>{v}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
          {upcomingContracts.length > 0 && (
            <Card className="overflow-hidden">
              <div className="h-px bg-gradient-to-r from-info/40 via-info/10 to-transparent" />
              <CardHeader className="pb-2">
                <div className="flex flex-reverse items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-info/10 flex items-center justify-center">
                    <Clock className="w-4 h-4 text-info" />
                  </div>
                  <CardTitle className="text-base">العقود القادمة ({upcomingContracts.length})</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                {upcomingContracts.map(c => {
                  const prevContract = contracts.find(c2 =>
                    c2.id !== c.id &&
                    c2.status !== 'terminated' &&
                    c2.end_date &&
                    c2.end_date <= c.start_date
                  )
                  const prevActive = prevContract && prevContract.status === 'active'
                  return (
                    <div key={c.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-muted/60 transition-colors text-right border border-border/60 mb-2 last:mb-0 group">
                      <div className="w-10 h-10 rounded-xl bg-info/10 text-info flex items-center justify-center font-black flex-shrink-0">
                        {c.clients?.name?.charAt(0)}
                      </div>
                      <button className="flex-1 text-right" onClick={() => navigate(`/contracts/${c.id}`)}>
                        <p className="font-bold text-sm text-foreground">{c.clients?.name}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(c.start_date)} — {formatDate(c.end_date)}</p>
                      </button>
                      <StatusBadge status="upcoming" />
                      <Button
                        size="icon-sm"
                        variant="outline"
                        title={prevActive ? 'لا يمكن التفعيل — العقد السابق لا يزال نشطاً' : 'تفعيل العقد الآن'}
                        disabled={prevActive}
                        onClick={async () => {
                          if (prevActive) return
                          const today = toLocalDateStr(new Date())
                          const { error } = await supabase.from('contracts').update({ status: 'active', start_date: today }).eq('id', c.id)
                          if (!error) {
                            toast({ title: 'تم تفعيل العقد', description: `يبدأ من ${today}`, variant: 'success' })
                            fetchAll()
                          } else {
                            toast({ title: 'خطأ', description: error.message, variant: 'error' })
                          }
                        }}
                        className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <PlayCircle className="w-4 h-4 text-success" />
                      </Button>
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Tab: History */}
        <TabsContent value="history" className="mt-6">
          <Card className="overflow-hidden">
            <div className="h-px bg-gradient-to-r from-muted-foreground/30 via-muted-foreground/10 to-transparent" />
            <CardHeader className="pb-2">
              <div className="flex flex-reverse items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
                  <History className="w-4 h-4 text-muted-foreground" />
                </div>
                <CardTitle className="text-base">سجل جميع العقود ({contracts.length})</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {contracts.length === 0 ? (
                <p className="text-center text-muted-foreground py-10 font-medium">لا توجد عقود سابقة</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>العميل</TableHead>
                      <TableHead>البداية</TableHead>
                      <TableHead>النهاية</TableHead>
                      <TableHead>القيمة</TableHead>
                      <TableHead>الحالة</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contracts.map(c => (
                      <TableRow key={c.id} className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => navigate(`/contracts/${c.id}`)}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-black text-xs flex-shrink-0">
                              {c.clients?.name?.charAt(0)}
                            </div>
                            <span className="font-medium">{c.clients?.name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">{formatDate(c.start_date)}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">{formatDate(c.end_date)}</TableCell>
                        <TableCell className="font-bold text-sm">{formatCurrency(c.total_value)}</TableCell>
                        <TableCell><StatusBadge status={c.status} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Maintenance */}
        <TabsContent value="maintenance" className="mt-6 space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="bg-warning/10 border border-warning/25 rounded-xl px-4 py-2.5 flex items-center gap-2 text-right">
                <Wrench className="w-4 h-4 text-warning" />
                <span className="text-xs text-muted-foreground">تكلفة الصيانة (6 أشهر):</span>
                <span className="font-black text-warning text-sm">{formatCurrency(recentMaintCost)}</span>
              </div>
            </div>
            <Button size="sm" onClick={() => setMaintDialogOpen(true)} className="gap-2 bg-primary hover:bg-primary/90">
              <Plus className="w-4 h-4" /> إضافة صيانة
            </Button>
          </div>
          <Card className="overflow-hidden">
            <div className="h-px bg-gradient-to-r from-warning/40 via-warning/10 to-transparent" />
            <CardContent className="pt-4">
              {maintenance.length === 0 ? (
                <div className="py-12 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-3">
                    <Wrench className="w-7 h-7 text-muted-foreground/40" />
                  </div>
                  <p className="text-muted-foreground font-medium">لا توجد سجلات صيانة</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>التاريخ</TableHead>
                      <TableHead>الوصف</TableHead>
                      <TableHead>الفني</TableHead>
                      <TableHead>التكلفة</TableHead>
                      <TableHead>حالة الدفع</TableHead>
                      <TableHead className="text-end">إجراءات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {maintenance.map(m => (
                      <TableRow key={m.id} className="hover:bg-muted/40 transition-colors">
                        <TableCell className="text-sm text-muted-foreground">{formatDate(m.date)}</TableCell>
                        <TableCell className="max-w-[160px] truncate text-sm">{m.description}</TableCell>
                        <TableCell className="text-sm">
                          {m.technician_name
                            ? <span className="inline-flex items-center gap-1.5"><Users className="w-3.5 h-3.5 text-muted-foreground" />{m.technician_name}</span>
                            : <span className="text-muted-foreground/50">—</span>}
                        </TableCell>
                        <TableCell className="font-bold text-sm">{formatCurrency(m.cost)}</TableCell>
                        <TableCell>
                          <button
                            onClick={() => toggleMaintPaid(m)}
                            className={cn(
                              'text-xs px-2.5 py-1 rounded-full border font-medium transition-all cursor-pointer',
                              m.is_paid
                                ? 'bg-success/10 text-success border-success/25 hover:bg-success/20'
                                : 'bg-destructive/10 text-destructive border-destructive/25 hover:bg-destructive/20'
                            )}
                          >
                            {m.is_paid ? '✓ مدفوع' : '✗ غير مدفوع'}
                          </button>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 justify-end">
                            <Button size="icon-sm" variant="ghost" onClick={() => openEditMaint(m)} title="تعديل" className="text-muted-foreground hover:text-primary">
                              <Edit2 className="w-3.5 h-3.5" />
                            </Button>
                            <Button size="icon-sm" variant="ghost" onClick={() => setDeleteConfirm(m.id)} className="text-muted-foreground hover:text-destructive">
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Revenue */}
        <TabsContent value="revenue" className="mt-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard title="الإيرادات (6 أشهر)" value={formatCurrency(recentRevenue)} icon={BarChart3} variant="success" />
            <StatCard title="إجمالي العقود" value={contracts.length} icon={FileText} variant="info" />
            <StatCard title="إجمالي المدفوع" value={formatCurrency(contracts.reduce((a, c) => a + contractPaid(c), 0))} icon={DollarSign} variant="default" />
            <StatCard title="إجمالي مستحق" value={formatCurrency(contracts.reduce((a, c) => a + Math.max(0, safeNum(c.total_value) - contractPaid(c)), 0))} icon={Clock} variant={recentRevenue > 0 ? 'danger' : 'warning'} />
          </div>
          <Card className="overflow-hidden">
            <div className="h-px bg-gradient-to-r from-success/40 via-success/10 to-transparent" />
            <CardHeader className="pb-2">
              <div className="flex flex-reverse items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-success/10 flex items-center justify-center">
                  <DollarSign className="w-4 h-4 text-success" />
                </div>
                <CardTitle className="text-base">تفاصيل المدفوعات</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>العميل</TableHead>
                    <TableHead>قيمة العقد</TableHead>
                    <TableHead>المدفوع</TableHead>
                    <TableHead>له / عليه</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contracts.map(c => {
                    const paid = contractPaid(c)
                    const owed = Math.max(0, safeNum(c.total_value) - paid)
                    const credit = Math.max(0, paid - safeNum(c.total_value))
                    const hasOwed = owed > 0
                    const hasCredit = credit > 0
                    return (
                      <TableRow key={c.id} className="hover:bg-muted/40 transition-colors">
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-black text-xs flex-shrink-0">
                              {c.clients?.name?.charAt(0)}
                            </div>
                            <span className="font-medium">{c.clients?.name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="font-bold text-sm">{formatCurrency(c.total_value)}</TableCell>
                        <TableCell className={hasOwed ? 'text-destructive font-bold' : 'text-success font-bold text-sm'}>
                          {formatCurrency(paid)}
                        </TableCell>
                        <TableCell>
                          {hasOwed ? (
                            <span className="inline-flex items-center gap-1 text-destructive font-bold text-sm">
                              <span className="text-xs bg-destructive/10 border border-destructive/25 px-1.5 py-0.5 rounded">عليه</span>
                              {formatCurrency(owed)}
                            </span>
                          ) : hasCredit ? (
                            <span className="inline-flex items-center gap-1 text-success font-bold text-sm">
                              <span className="text-xs bg-success/10 border border-success/25 px-1.5 py-0.5 rounded">له</span>
                              {formatCurrency(credit)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-sm">متكافئ</span>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add Maintenance Dialog */}
      <Dialog open={maintDialogOpen} onOpenChange={setMaintDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>إضافة سجل صيانة</DialogTitle></DialogHeader>
          <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="التاريخ" required>
              <DateInput value={maintForm.date} onChange={e => setMaintForm({...maintForm, date: e.target.value})} />
            </FormField>
            <FormField label="اسم الفني">
              <Input value={maintForm.technician_name} onChange={e => setMaintForm({...maintForm, technician_name: e.target.value})} />
            </FormField>
            <FormField label="الوصف" required className="sm:col-span-2">
              <Textarea value={maintForm.description} onChange={e => setMaintForm({...maintForm, description: e.target.value})} placeholder="وصف العمل المنجز..." />
            </FormField>
            <FormField label="التكلفة (جنيه)">
              <Input type="number" value={maintForm.cost} onChange={e => setMaintForm({...maintForm, cost: e.target.value})} />
            </FormField>
            <FormField label="حالة الدفع">
              <div className="flex items-center gap-3 h-10">
                <input type="checkbox" id="is_paid_add" checked={maintForm.is_paid} onChange={e => setMaintForm({...maintForm, is_paid: e.target.checked})} className="w-4 h-4 rounded accent-primary" />
                <label htmlFor="is_paid_add" className="text-sm">تم الدفع</label>
              </div>
            </FormField>
          </div>
          <DialogFooter className="justify-end">
            <Button variant="outline" onClick={() => setMaintDialogOpen(false)}>إلغاء</Button>
            <Button onClick={saveMaint} disabled={saving}>{saving ? 'حفظ...' : 'إضافة'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Maintenance Dialog */}
      <Dialog open={!!editingMaintId} onOpenChange={v => { if (!v) { setEditingMaintId(null); setEditingMaintForm({ date: '', description: '', cost: '', technician_name: '', is_paid: false }) } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>تعديل سجل الصيانة</DialogTitle></DialogHeader>
          <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="التاريخ">
              <DateInput value={editingMaintForm.date} onChange={e => setEditingMaintForm({...editingMaintForm, date: e.target.value})} />
            </FormField>
            <FormField label="اسم الفني">
              <Input value={editingMaintForm.technician_name} onChange={e => setEditingMaintForm({...editingMaintForm, technician_name: e.target.value})} />
            </FormField>
            <FormField label="الوصف" required className="sm:col-span-2">
              <Textarea value={editingMaintForm.description} onChange={e => setEditingMaintForm({...editingMaintForm, description: e.target.value})} placeholder="وصف العمل المنجز..." />
            </FormField>
            <FormField label="التكلفة (جنيه)">
              <Input type="number" value={editingMaintForm.cost} onChange={e => setEditingMaintForm({...editingMaintForm, cost: e.target.value})} />
            </FormField>
            <FormField label="حالة الدفع">
              <div className="flex items-center gap-3 h-10">
                <input type="checkbox" id="is_paid_edit" checked={editingMaintForm.is_paid} onChange={e => setEditingMaintForm({...editingMaintForm, is_paid: e.target.checked})} className="w-4 h-4 rounded accent-primary" />
                <label htmlFor="is_paid_edit" className="text-sm">تم الدفع</label>
              </div>
            </FormField>
          </div>
          <DialogFooter className="justify-end">
            <Button variant="outline" onClick={() => { setEditingMaintId(null); setEditingMaintForm({ date: '', description: '', cost: '', technician_name: '', is_paid: false }) }}>إلغاء</Button>
            <Button onClick={saveEditedMaint} disabled={saving}>{saving ? 'حفظ...' : 'تحديث'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteConfirm}
        onOpenChange={() => setDeleteConfirm(null)}
        title="حذف سجل الصيانة"
        description="هل أنت متأكد من حذف هذا السجل؟ لا يمكن التراجع عن هذا الإجراء."
        confirmText="حذف"
        onConfirm={() => deleteMaint(deleteConfirm)}
      />
    </div>
    </div>
  )
}
