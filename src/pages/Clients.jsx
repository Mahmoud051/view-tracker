import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, Users, Phone, FileText } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatCurrency, safeNum } from '@/lib/utils'
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
      supabase.from('contracts').select('id, client_id, status, total_value'),
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
    const active = cts.filter(c => c.status === 'active').length
    const totalValue = cts.reduce((a, c) => a + safeNum(c.total_value), 0)
    const totalPaid = cts.reduce((a, c) => a + (paymentsMap[c.id] || 0), 0)
    return { active, total: cts.length, totalValue, totalPaid, remaining: totalValue - totalPaid }
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
                <div className="flex items-center gap-3 mb-4">
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
                <div className="grid grid-cols-3 gap-2 pt-3 border-t border-border">
                  <div className="text-center">
                    <p className="text-lg font-bold text-foreground">{stats.active}</p>
                    <p className="text-xs text-muted-foreground">نشط</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-bold text-foreground truncate">{formatCurrency(stats.totalValue).replace(' جنيه', '')}</p>
                    <p className="text-xs text-muted-foreground">إجمالي</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-bold text-destructive truncate">{formatCurrency(stats.remaining).replace(' جنيه', '')}</p>
                    <p className="text-xs text-muted-foreground">متبقي</p>
                  </div>
                </div>
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
          <DialogFooter>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'حفظ...' : 'إضافة عميل'}</Button>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>إلغاء</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
