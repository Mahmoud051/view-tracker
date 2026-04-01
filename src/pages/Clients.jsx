import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, Users, Phone, FileText, Building2, Calendar } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatCurrency, formatDate, safeNum, computeContractStatus } from '@/lib/utils'
import { useToast } from '@/contexts/ToastContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { PageHeader, EmptyState, LoadingScreen, FormField } from '@/components/ui/shared'
import { Badge } from '@/components/ui/badge'

export default function Clients() {
  const [clients, setClients] = useState([])
  const [contractsMap, setContractsMap] = useState({})
  const [paymentsMap, setPaymentsMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState({ name: '', phone: '' })
  const [formErrors, setFormErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const navigate = useNavigate()
  const { toast } = useToast()

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    setLoading(true)
    const [{ data: c }, { data: contracts }, { data: payments }] = await Promise.all([
      supabase.from('clients').select('*').order('created_at', { ascending: false }),
      supabase.from('contracts').select('id, client_id, status, total_value, start_date, end_date, duration_months, payment_frequency, stands(code, address)'),
      supabase.from('payments').select('id, contract_id, amount'),
    ])
    setClients(c || [])

    // Build contracts map per client
    const cm = {}
    ;(contracts || []).forEach(ct => {
      if (!cm[ct.client_id]) cm[ct.client_id] = []
      cm[ct.client_id].push(ct)
    })
    setContractsMap(cm)

    // Build payments map per contract
    const pm = {}
    ;(payments || []).forEach(p => {
      pm[p.contract_id] = (pm[p.contract_id] || 0) + safeNum(p.amount)
    })
    setPaymentsMap(pm)
    setLoading(false)
  }

  const filtered = (clients || []).filter(c =>
    !search ||
    c.name?.toLowerCase().includes(search.toLowerCase()) ||
    c.phone?.includes(search)
  )

  function clientStats(clientId) {
    const cts = contractsMap[clientId] || []
    const active = cts.filter(c => computeContractStatus(c.start_date, c.end_date, c.status) === 'active')
    const totalValue = cts.reduce((a, c) => a + safeNum(c.total_value), 0)
    const totalPaid = cts.reduce((a, c) => a + (paymentsMap[c.id] || 0), 0)
    const owed = Math.max(0, totalValue - totalPaid)

    // periodDue: sum of period-based amounts due across all active contracts
    const INTERVAL_MONTHS = { monthly: 1, quarterly: 3, semi_annual: 6, annual: 12 }
    const now = new Date()
    let periodDue = 0
    active.forEach(c => {
      if (!c.start_date || !c.payment_frequency) return
      const start = new Date(c.start_date)
      const end = c.end_date ? new Date(c.end_date) : null
      const nowCapped = end && now > end ? end : now
      const monthlyRate = safeNum(c.total_value) / (parseInt(c.duration_months) || 1)
      const intervalMonths = INTERVAL_MONTHS[c.payment_frequency] || 1
      const periodRate = monthlyRate * intervalMonths
      const rawMonths = (nowCapped.getFullYear() - start.getFullYear()) * 12 + (nowCapped.getMonth() - start.getMonth())
      const completeMonths = nowCapped.getDate() >= start.getDate() ? rawMonths + 1 : rawMonths
      const totalPeriods = Math.ceil((parseInt(c.duration_months) || 1) / intervalMonths)
      const periodsDue = Math.min(Math.ceil(completeMonths / intervalMonths), totalPeriods)
      periodDue += Math.max(0, periodsDue * periodRate - (paymentsMap[c.id] || 0))
    })

    // Nearest contract expiry among active contracts
    const nearestContract = active.reduce((nearest, c) => {
      if (!c.end_date) return nearest
      const daysLeft = Math.ceil((new Date(c.end_date) - now) / 86400000)
      if (daysLeft <= 0) return nearest
      if (!nearest || daysLeft < nearest.daysLeft) return { ...c, daysLeft }
      return nearest
    }, null)

    return { active: active.length, total: cts.length, totalValue, totalPaid, owed, periodDue, nearestContract }
  }

  async function handleSave() {
    const errs = {}
    if (!form.name.trim()) errs.name = 'اسم العميل مطلوب'
    setFormErrors(errs)
    if (Object.keys(errs).length) return
    setSaving(true)
    try {
      const { error } = await supabase.from('clients').insert([{ name: form.name.trim(), phone: form.phone.trim() }])
      if (error) throw error
      toast({ title: 'تم الحفظ', description: 'تم إضافة العميل بنجاح', variant: 'success' })
      setDialogOpen(false)
      setForm({ name: '', phone: '' })
      fetchData()
    } catch (e) { toast({ title: 'خطأ', description: e.message, variant: 'error' }) }
    setSaving(false)
  }

  if (loading) return <LoadingScreen />

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="العملاء" description={`${clients.length} عميل`}>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="w-4 h-4" /> إضافة عميل
        </Button>
      </PageHeader>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="بحث بالاسم أو الهاتف..." value={search} onChange={e => setSearch(e.target.value)} className="ps-9" />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title="لا يوجد عملاء"
          description="لم يتم العثور على عملاء يطابقون بحثك"
          action={!search && <Button onClick={() => setDialogOpen(true)}><Plus className="w-4 h-4" /> إضافة عميل</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(client => {
            const stats = clientStats(client.id)
            return (
              <button
                key={client.id}
                onClick={() => navigate(`/clients/${client.id}`)}
                className="text-start bg-card border border-border rounded-2xl p-5 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 group"
              >
                {/* Avatar + Name */}
                <div className="flex items-center gap-3 mb-4 ">
                  <div className="w-12 h-12 rounded-2xl bg-primary/15 text-primary flex items-center justify-center text-lg font-black flex-shrink-0 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                    {client.name?.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-foreground truncate">{client.name}</p>
                    {client.phone && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <Phone className="w-3 h-3" />{client.phone}
                      </p>
                    )}
                  </div>
                </div>
                {/* Stats */}
                <div className="grid grid-cols-3 gap-2 py-3 border-t border-border">
                  <div className="text-center">
                    <p className="text-lg font-bold text-foreground">{stats.active}</p>
                    <p className="text-xs text-muted-foreground">نشط</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-bold text-foreground truncate">{formatCurrency(stats.totalValue).replace(' جنيه', '')}</p>
                    <p className="text-xs text-muted-foreground">إجمالي</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-bold text-success truncate">{formatCurrency(stats.totalPaid).replace(' جنيه', '')}</p>
                    <p className="text-xs text-muted-foreground">المدفوع</p>
                  </div>
                </div>

                {/* periodDue / owed row */}
                {(stats.periodDue > 0 || stats.owed > 0) && (
                  <div className="flex items-center gap-2 py-2 border-t border-border ">
                    {stats.periodDue > 0 && (
                      <div className="flex items-center gap-1 text-destructive pe-1">
                        <Calendar className="w-3 h-3" />
                        <span className="text-xs font-medium">مستحق: {formatCurrency(stats.periodDue).replace(' جنيه', '')}</span>
                      </div>
                    )}
                    {stats.owed > 0 && stats.periodDue === 0 && (
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Calendar className="w-3 h-3" />
                        <span className="text-xs">الباقي: {formatCurrency(stats.owed).replace(' جنيه', '')}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Nearest contract */}
                {stats.nearestContract && (
                  <div className="flex items-center gap-2 py-2 border-t border-border pe-1">
                    <Building2 className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-foreground truncate">{stats.nearestContract.stands?.code} — {stats.nearestContract.stands?.address}</p>
                      <p className="text-xs text-muted-foreground">ينتهي: {formatDate(stats.nearestContract.end_date)}</p>
                    </div>
                    <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full flex-shrink-0 ${stats.nearestContract.daysLeft <= 30 ? 'bg-destructive/15 text-destructive' : stats.nearestContract.daysLeft <= 90 ? 'bg-warning/15 text-warning' : 'bg-success/15 text-success'}`}>
                      {stats.nearestContract.daysLeft} يوم
                    </span>
                  </div>
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* Add Client Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>إضافة عميل جديد</DialogTitle></DialogHeader>
          <div className="p-6 space-y-4">
            <FormField label="اسم العميل" required error={formErrors.name}>
              <Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="الاسم الكامل" />
            </FormField>
            <FormField label="رقم الهاتف">
              <Input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} placeholder="01x xxxx xxxx" dir="ltr" />
            </FormField>
          </div>
          <DialogFooter className="justify-end">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>إلغاء</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'حفظ...' : 'إضافة عميل'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
