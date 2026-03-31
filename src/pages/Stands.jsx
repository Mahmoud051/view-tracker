import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, Building2, MapPin, Calendar } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatDate, computeGovStatus, todayStr } from '@/lib/utils'
import { useToast } from '@/contexts/ToastContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/index'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { PageHeader, StatusBadge, EmptyState, LoadingScreen, FormField } from '@/components/ui/shared'

const EMPTY_FORM = {
  code: '', address: '', width: '', height: '', desc: '',
  gov_license_number: '', gov_rental_start: '', gov_rental_end: '', gov_rental_cost: '',
}

export default function Stands() {
  const [stands, setStands] = useState([])
  const [contracts, setContracts] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formErrors, setFormErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [photoFile, setPhotoFile] = useState(null)
  const navigate = useNavigate()
  const { toast } = useToast()

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    setLoading(true)
    const [{ data: s }, { data: c }] = await Promise.all([
      supabase.from('stands').select('*').order('created_at', { ascending: false }),
      supabase.from('contracts').select('stand_id, status, start_date, end_date').eq('status', 'active'),
    ])
    setStands(s || [])
    setContracts(c || [])
    setLoading(false)
  }

  const rentedIds = new Set((contracts || []).map(c => c.stand_id))

  const filtered = (stands || []).filter(s => {
    const matchSearch = !search ||
      s.code?.toLowerCase().includes(search.toLowerCase()) ||
      s.address?.toLowerCase().includes(search.toLowerCase())
    const standStatus = rentedIds.has(s.id) ? 'rented' : 'available'
    const matchStatus = statusFilter === 'all' || standStatus === statusFilter
    return matchSearch && matchStatus
  })

  function validateForm() {
    const errs = {}
    if (!form.code.trim()) errs.code = 'كود اللوحة مطلوب'
    if (!form.address.trim()) errs.address = 'العنوان مطلوب'
    if (!form.width || isNaN(form.width)) errs.width = 'العرض مطلوب'
    if (!form.height || isNaN(form.height)) errs.height = 'الارتفاع مطلوب'
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
      setForm(EMPTY_FORM)
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
        <Button onClick={() => setDialogOpen(true)}>
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
            const isRented = rentedIds.has(stand.id)
            const govSt = computeGovStatus(stand.gov_rental_end)
            return (
              <button
                key={stand.id}
                onClick={() => navigate(`/stands/${stand.id}`)}
                className="text-start bg-card border border-border rounded-2xl overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 card-hover group"
              >
                {/* Photo */}
                <div className="h-36 bg-muted relative overflow-hidden">
                  {stand.photo_url ? (
                    <img src={stand.photo_url} alt={stand.code} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Building2 className="w-10 h-10 text-muted-foreground/40" />
                    </div>
                  )}
                  <div className="absolute top-2 start-2">
                    <StatusBadge status={isRented ? 'rented' : 'available'} />
                  </div>
                </div>
                {/* Info */}
                <div className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-bold text-foreground">{stand.code}</h3>
                    {govSt !== 'active' && <StatusBadge status={govSt} className="text-xs" />}
                  </div>
                  <div className="flex items-start gap-1.5 text-muted-foreground">
                    <MapPin className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    <p className="text-xs line-clamp-2">{stand.address}</p>
                  </div>
                  {stand.gov_rental_end && (
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Calendar className="w-3.5 h-3.5 flex-shrink-0" />
                      <p className="text-xs">ترخيص حتى: {formatDate(stand.gov_rental_end)}</p>
                    </div>
                  )}
                  {(stand.width && stand.height) && (
                    <p className="text-xs text-muted-foreground">
                      {stand.width} × {stand.height} م = {(stand.width * stand.height).toFixed(1)} م²
                    </p>
                  )}
                  {stand.desc && (
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{stand.desc}</p>
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
            <FormField label="العرض (متر)" required error={formErrors.width}>
              <Input type="number" value={form.width} onChange={e => setForm({ ...form, width: e.target.value })} placeholder="0" />
            </FormField>
            <FormField label="الارتفاع (متر)" required error={formErrors.height}>
              <Input type="number" value={form.height} onChange={e => setForm({ ...form, height: e.target.value })} placeholder="0" />
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
              <Input type="date" value={form.gov_rental_start} onChange={e => setForm({ ...form, gov_rental_start: e.target.value })} />
            </FormField>
            <FormField label="تاريخ انتهاء الترخيص">
              <Input type="date" value={form.gov_rental_end} onChange={e => setForm({ ...form, gov_rental_end: e.target.value })} />
            </FormField>
          </div>
          <DialogFooter>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'جاري الحفظ...' : 'حفظ اللوحة'}
            </Button>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>إلغاء</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
