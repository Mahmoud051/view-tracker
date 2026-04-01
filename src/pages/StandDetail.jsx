import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Edit2, Save, X, Plus, Trash2, Building2, MapPin, Wrench, PlayCircle, ToggleLeft, ToggleRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatDate, formatCurrency, computeGovStatus, safeNum, cn, toLocalDateStr } from '@/lib/utils'
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
  const isStandActive = stand.is_active !== false // default true if undefined

  return (
    <div className={cn('space-y-6 animate-fade-in', !isStandActive && 'opacity-75')}>
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/stands')}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-foreground">{stand.code}</h1>
            {!isStandActive && <Badge className="bg-muted text-muted-foreground border border-border text-xs">متوقف</Badge>}
            <StatusBadge status={isRented ? 'rented' : 'available'} />
            <StatusBadge status={govStatus} />
          </div>
          <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
            <MapPin className="w-3.5 h-3.5 flex-shrink-0" />{stand.address}
          </p>
        </div>
        <Button
          size="sm"
          variant={isStandActive ? 'outline' : 'default'}
          onClick={toggleStandActive}
          className={cn('gap-2', isStandActive ? 'text-muted-foreground border-muted' : 'bg-success hover:bg-success/90')}
        >
          {isStandActive
            ? <><ToggleRight className="w-4 h-4" /> إيقاف</>
            : <><ToggleLeft className="w-4 h-4" /> تفعيل</>}
        </Button>
      </div>

      <Tabs defaultValue="info">
        <TabsList className="flex-wrap h-auto gap-1 w-full sm:w-auto">
          <TabsTrigger value="info">المعلومات</TabsTrigger>
          <TabsTrigger value="gov">الترخيص الحكومي</TabsTrigger>
          <TabsTrigger value="contract">العقد الحالي</TabsTrigger>
          <TabsTrigger value="history">سجل العقود</TabsTrigger>
          <TabsTrigger value="maintenance">الصيانة</TabsTrigger>
          <TabsTrigger value="revenue">الإيرادات</TabsTrigger>
        </TabsList>

        {/* Tab: Basic Info */}
        <TabsContent value="info">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>المعلومات الأساسية</CardTitle>
              {!editingInfo ? (
                <Button size="sm" variant="outline" onClick={() => setEditingInfo(true)}>
                  <Edit2 className="w-4 h-4" /> تعديل
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button size="sm" onClick={saveInfo} disabled={saving}><Save className="w-4 h-4" /> حفظ</Button>
                  <Button size="sm" variant="outline" onClick={() => setEditingInfo(false)}><X className="w-4 h-4" /></Button>
                </div>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              {stand.photo_url && !editingInfo && (
                <img src={stand.photo_url} alt={stand.code} className="w-full max-w-sm h-52 object-cover rounded-xl border border-border" />
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
                <div className="space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {[['الكود', stand.code], ['الطول', `${stand.width} م`], ['العرض', `${stand.height} م`], ['المساحة', `${safeNum(stand.width) * safeNum(stand.height)} م²`], ['الأوجه', stand.sides == 2 ? 'وجهين' : 'وجه واحد']].map(([k,v]) => (
                      <div key={k}>
                        <p className="text-xs text-muted-foreground">{k}</p>
                        <p className="font-semibold text-foreground">{v}</p>
                      </div>
                    ))}
                  </div>
                  {stand.desc && (
                    <div className="border-t border-border pt-4">
                      <p className="text-sm text-muted-foreground mb-2">الوصف</p>
                      <p className="text-foreground whitespace-pre-wrap">{stand.desc}</p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Gov Permit */}
        <TabsContent value="gov">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>الترخيص الحكومي</CardTitle>
              {!editingGov ? (
                <Button size="sm" variant="outline" onClick={() => setEditingGov(true)}><Edit2 className="w-4 h-4" /> تعديل</Button>
              ) : (
                <div className="flex gap-2">
                  <Button size="sm" onClick={saveGov} disabled={saving}><Save className="w-4 h-4" /> حفظ</Button>
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
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {[
                    ['رقم الترخيص', stand.gov_license_number || '—'],
                    ['تاريخ البداية', formatDate(stand.gov_rental_start)],
                    ['تاريخ الانتهاء', formatDate(stand.gov_rental_end)],
                    ['التكلفة', formatCurrency(stand.gov_rental_cost)],
                  ].map(([k,v]) => (
                    <div key={k}>
                      <p className="text-xs text-muted-foreground">{k}</p>
                      <p className="font-semibold text-foreground mt-0.5">{v}</p>
                    </div>
                  ))}
                  <div>
                    <p className="text-xs text-muted-foreground">الحالة</p>
                    <p className="mt-0.5"><StatusBadge status={govStatus} /></p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Active Contract */}
        <TabsContent value="contract">
          {!activeContract ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Building2 className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-muted-foreground mb-4">لا يوجد عقد نشط لهذه اللوحة</p>
                <Button onClick={() => navigate(`/contracts?stand=${id}`)}>
                  <Plus className="w-4 h-4" /> إنشاء عقد جديد
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>العقد الحالي</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {[
                    ['العميل', activeContract.clients?.name],
                    ['الهاتف', activeContract.clients?.phone],
                    ['تاريخ البداية', formatDate(activeContract.start_date)],
                    ['تاريخ الانتهاء', formatDate(activeContract.end_date)],
                    ['قيمة العقد', formatCurrency(activeContract.total_value)],
                    ['المدفوع', formatCurrency(contractPaid(activeContract))],
                    ['مستحق الآن', formatCurrency(periodDue)],
                    ['مدة العقد', `${activeContract.duration_months || '—'} شهر`],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <p className="text-xs text-muted-foreground">{k}</p>
                      <p className={`font-semibold text-foreground ${k === 'مستحق الآن' && periodDue > 0 ? 'text-destructive' : ''}`}>{v || '—'}</p>
                    </div>
                  ))}
                </div>
                <Button variant="outline" size="sm" onClick={() => navigate(`/contracts/${activeContract.id}`)}>
                  عرض تفاصيل العقد الكاملة
                </Button>
              </CardContent>
            </Card>
          )}
          {upcomingContracts.length > 0 && (
            <Card className="mt-4">
              <CardHeader><CardTitle>العقود القادمة ({upcomingContracts.length})</CardTitle></CardHeader>
              <CardContent>
                {upcomingContracts.map(c => {
                  // Find the contract that would be the "previous" one (non-terminated, ends before or at upcoming start)
                  const prevContract = contracts.find(c2 =>
                    c2.id !== c.id &&
                    c2.status !== 'terminated' &&
                    c2.end_date &&
                    c2.end_date <= c.start_date
                  )
                  const prevActive = prevContract && prevContract.status === 'active'
                  return (
                    <div key={c.id} className="flex justify-between items-center p-3 rounded-xl hover:bg-muted transition-colors text-start border border-border mb-2">
                      <button className="flex-1 text-start" onClick={() => navigate(`/contracts/${c.id}`)}>
                        <p className="font-medium text-sm">{c.clients?.name}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(c.start_date)} — {formatDate(c.end_date)}</p>
                      </button>
                      <div className="flex items-center gap-2 me-3">
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
                        >
                          <PlayCircle className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Tab: History */}
        <TabsContent value="history">
          <Card>
            <CardHeader><CardTitle>سجل جميع العقود</CardTitle></CardHeader>
            <CardContent>
              {contracts.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">لا توجد عقود سابقة</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>العميل</TableHead>
                      <TableHead>البداية</TableHead>
                      <TableHead>النهاية</TableHead>
                      <TableHead>القيمة</TableHead>
                      <TableHead>الحالة</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contracts.map(c => (
                      <TableRow key={c.id} className="cursor-pointer" onClick={() => navigate(`/contracts/${c.id}`)}>
                        <TableCell className="font-medium">{c.clients?.name}</TableCell>
                        <TableCell>{formatDate(c.start_date)}</TableCell>
                        <TableCell>{formatDate(c.end_date)}</TableCell>
                        <TableCell>{formatCurrency(c.total_value)}</TableCell>
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
        <TabsContent value="maintenance">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="bg-warning/10 border border-warning/30 rounded-xl px-4 py-2 text-sm">
                <span className="text-muted-foreground">تكلفة الصيانة (6 أشهر): </span>
                <span className="font-bold text-warning">{formatCurrency(recentMaintCost)}</span>
              </div>
              <Button size="sm" onClick={() => setMaintDialogOpen(true)}>
                <Plus className="w-4 h-4" /> إضافة صيانة
              </Button>
            </div>
            <Card>
              <CardContent className="pt-4">
                {maintenance.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">لا توجد سجلات صيانة</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>التاريخ</TableHead>
                        <TableHead>الوصف</TableHead>
                        <TableHead>الفني</TableHead>
                        <TableHead>التكلفة</TableHead>
                        <TableHead>مدفوع</TableHead>
                        <TableHead className="text-end">الإجراءات</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {maintenance.map(m => (
                        <TableRow key={m.id}>
                          <TableCell>{formatDate(m.date)}</TableCell>
                          <TableCell className="max-w-[180px] truncate">{m.description}</TableCell>
                          <TableCell>{m.technician_name || '—'}</TableCell>
                          <TableCell>{formatCurrency(m.cost)}</TableCell>
                          <TableCell>
                            <button onClick={() => toggleMaintPaid(m)} className={`text-xs px-2 py-1 rounded-full border font-medium transition-colors ${m.is_paid ? 'bg-success/15 text-success border-success/30' : 'bg-destructive/15 text-destructive border-destructive/30'}`}>
                              {m.is_paid ? 'مدفوع' : 'غير مدفوع'}
                            </button>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1 justify-end">
                              <Button size="icon-sm" variant="ghost" onClick={() => openEditMaint(m)} title="تعديل" className="text-primary hover:text-primary">
                                <Edit2 className="w-3.5 h-3.5" />
                              </Button>
                              <Button size="icon-sm" variant="ghost" onClick={() => setDeleteConfirm(m.id)} className="text-destructive hover:text-destructive">
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
          </div>
        </TabsContent>

        {/* Tab: Revenue */}
        <TabsContent value="revenue">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <StatCard title="الإيرادات (6 أشهر)" value={formatCurrency(recentRevenue)} icon={Building2} variant="success" />
            <StatCard title="إجمالي العقود" value={contracts.length} icon={Building2} variant="default" />
          </div>
          <Card className="mt-4">
            <CardHeader><CardTitle>تفاصيل المدفوعات</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
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
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.clients?.name}</TableCell>
                        <TableCell>{formatCurrency(c.total_value)}</TableCell>
                        <TableCell className={hasOwed ? 'text-destructive' : 'text-success'}>{formatCurrency(paid)}</TableCell>
                        <TableCell className={hasOwed ? 'text-destructive font-medium' : 'text-success font-medium'}>
                          {hasOwed ? `عليه: ${formatCurrency(owed)}` : hasCredit ? `له: ${formatCurrency(credit)}` : '—'}
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
          <DialogFooter>
            <Button onClick={saveMaint} disabled={saving}>{saving ? 'حفظ...' : 'إضافة'}</Button>
            <Button variant="outline" onClick={() => setMaintDialogOpen(false)}>إلغاء</Button>
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
          <DialogFooter>
            <Button onClick={saveEditedMaint} disabled={saving}>{saving ? 'حفظ...' : 'تحديث'}</Button>
            <Button variant="outline" onClick={() => { setEditingMaintId(null); setEditingMaintForm({ date: '', description: '', cost: '', technician_name: '', is_paid: false }) }}>إلغاء</Button>
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
  )
}
