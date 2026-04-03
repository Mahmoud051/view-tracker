import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowRight, Edit2, Save, X, Phone, FileText } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatDate, formatCurrency, safeNum, computeContractStatus } from '@/lib/utils'
import { useToast } from '@/contexts/ToastContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/index'
import { LoadingScreen, StatusBadge, FormField, StatCard } from '@/components/ui/shared'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function ClientDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { toast } = useToast()
  const [client, setClient] = useState(null)
  const [contracts, setContracts] = useState([])
  const [paymentsMap, setPaymentsMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ name: '', phone: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetchAll() }, [id])

  async function fetchAll() {
    setLoading(true)
    const [{ data: c }, { data: cts }] = await Promise.all([
      supabase.from('clients').select('*').eq('id', id).single(),
      supabase.from('contracts').select('*, stands(code, address), payments(*)').eq('client_id', id).order('created_at', { ascending: false }),
    ])
    setClient(c)
    setForm({ name: c?.name || '', phone: c?.phone || '' })
    setContracts(cts || [])

    const pm = {}
    ;(cts || []).forEach(ct => {
      pm[ct.id] = (ct.payments || []).reduce((a, p) => a + safeNum(p.amount), 0)
    })
    setPaymentsMap(pm)
    setLoading(false)
  }

  async function handleSave() {
    if (!form.name.trim()) { toast({ title: 'خطأ', description: 'الاسم مطلوب', variant: 'error' }); return }
    setSaving(true)
    const { error } = await supabase.from('clients').update({ name: form.name, phone: form.phone }).eq('id', id)
    if (!error) {
      toast({ title: 'تم الحفظ', variant: 'success' })
      setEditing(false)
      fetchAll()
    } else {
      toast({ title: 'خطأ', description: error.message, variant: 'error' })
    }
    setSaving(false)
  }

  if (loading) return <LoadingScreen />
  if (!client) return <div className="p-8 text-center text-muted-foreground">العميل غير موجود</div>

  const active = contracts.filter(c => computeContractStatus(c.start_date, c.end_date, c.status) === 'active')
  const expired = contracts.filter(c => ['expired', 'terminated'].includes(computeContractStatus(c.start_date, c.end_date, c.status)))

  // For open contracts, calculate expected value from elapsed periods (not null total_value)
  const totalValue = contracts.reduce((a, c) => {
    if (c.is_open) {
      if (!c.start_date || !c.monthly_rate) return a + (paymentsMap[c.id] || 0)
      const paymentFreq = c.payment_frequency || 'monthly'
      const INTERVAL = { monthly: 1, quarterly: 3, semi_annual: 6, annual: 12 }
      const start = new Date(c.start_date)
      const now = new Date()
      // Cap at end_date if terminated/expired
      const end = c.end_date ? new Date(c.end_date) : null
      const nowCapped = end && now > end ? end : now
      const intervalMonths = INTERVAL[paymentFreq] || 1
      const periodRate = safeNum(c.monthly_rate) * intervalMonths
      const rawMonths = (nowCapped.getFullYear() - start.getFullYear()) * 12 + (nowCapped.getMonth() - start.getMonth())
      const completeMonths = nowCapped.getDate() >= start.getDate() ? rawMonths + 1 : rawMonths
      const periodsDue = Math.ceil(completeMonths / intervalMonths)
      return a + (periodsDue * periodRate)
    }
    return a + safeNum(c.total_value)
  }, 0)

  const totalPaid = contracts.reduce((a, c) => a + (paymentsMap[c.id] || 0), 0)
  const owed = Math.max(0, totalValue - totalPaid)
  const credit = Math.max(0, totalPaid - totalValue)

  // Period-based amount due across all contracts (including terminated)
  const INTERVAL_MONTHS = { monthly: 1, quarterly: 3, semi_annual: 6, annual: 12 }
  const now = new Date()
  const periodDue = contracts.reduce((acc, c) => {
    if (!c.start_date) return acc
    const realStatus = computeContractStatus(c.start_date, c.end_date, c.status)
    if (realStatus === 'upcoming') return acc
    // Default to monthly if payment_frequency is not set
    const paymentFreq = c.payment_frequency || 'monthly'
    const start = new Date(c.start_date)
    const end = c.end_date ? new Date(c.end_date) : null
    const nowCapped = end && now > end ? end : now
    // For open contracts, prefer monthly_rate; otherwise calculate from total_value
    const monthlyRate = (c.is_open && c.monthly_rate) ? safeNum(c.monthly_rate) : (safeNum(c.total_value) / (parseInt(c.duration_months) || 1))
    const intervalMonths = INTERVAL_MONTHS[paymentFreq] || 1
    const periodRate = monthlyRate * intervalMonths
    const rawMonths = (nowCapped.getFullYear() - start.getFullYear()) * 12 + (nowCapped.getMonth() - start.getMonth())
    const completeMonths = nowCapped.getDate() >= start.getDate() ? rawMonths + 1 : rawMonths

    let periodsDue
    if (c.is_open) {
      periodsDue = Math.ceil(completeMonths / intervalMonths)
    } else {
      const totalPeriods = Math.ceil((parseInt(c.duration_months) || 1) / intervalMonths)
      periodsDue = Math.min(Math.ceil(completeMonths / intervalMonths), totalPeriods)
    }
    const due = periodsDue * periodRate - (paymentsMap[c.id] || 0)
    return acc + Math.max(0, due)
  }, 0)

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/clients')}>
          <ArrowRight className="w-4 h-4" />
        </Button>
        <div className="flex-1 flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-primary/15 text-primary flex items-center justify-center text-xl font-black">
            {client.name?.charAt(0)}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">{client.name}</h1>
            {client.phone && (
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                <Phone className="w-3.5 h-3.5" />{client.phone}
              </p>
            )}
          </div>
        </div>
        {!editing ? (
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}><Edit2 className="w-4 h-4" /> تعديل</Button>
        ) : (
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSave} disabled={saving}><Save className="w-4 h-4" /> حفظ</Button>
            <Button size="sm" variant="outline" onClick={() => setEditing(false)}><X className="w-4 h-4" /></Button>
          </div>
        )}
      </div>

      {/* Edit form */}
      {editing && (
        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField label="الاسم" required>
                <Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
              </FormField>
              <FormField label="الهاتف">
                <Input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} dir="ltr" />
              </FormField>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard title="عقود نشطة" value={active.length} icon={FileText} variant="success" />
        <StatCard title="عقود منتهية" value={expired.length} icon={FileText} variant="default" />
        <StatCard title="إجمالي المدفوع" value={formatCurrency(totalPaid)} icon={FileText} variant="info" />
        <StatCard title="مستحق الآن" value={formatCurrency(periodDue)} icon={FileText} variant={periodDue > 0 ? 'danger' : 'success'} />
        <StatCard title="عليه / مستحق" value={formatCurrency(owed)} icon={FileText} variant={owed > 0 ? 'warning' : 'success'} />
      </div>

      {/* Contracts table */}
      <Card>
        <CardHeader>
          <CardTitle>جميع العقود ({contracts.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {contracts.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">لا توجد عقود لهذا العميل</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>اللوحة</TableHead>
                    <TableHead>نوع الإيجار</TableHead>
                    <TableHead>البداية</TableHead>
                    <TableHead>النهاية</TableHead>
                    <TableHead>القيمة</TableHead>
                    <TableHead>المدفوع</TableHead>
                    <TableHead>مستحق الآن</TableHead>
                    <TableHead>الباقي</TableHead>
                    <TableHead>الحالة</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contracts.map(c => {
                    const paid = paymentsMap[c.id] || 0
                    const contractOwed = Math.max(0, safeNum(c.total_value) - paid)
                    const realStatus = computeContractStatus(c.start_date, c.end_date, c.status)

                    // Period-based amount due for this contract
                    let periodDue = 0
                    if (c.start_date && realStatus !== 'upcoming') {
                      const INTERVAL_MONTHS = { monthly: 1, quarterly: 3, semi_annual: 6, annual: 12 }
                      const now = new Date()
                      const start = new Date(c.start_date)
                      const paymentFreq = c.payment_frequency || 'monthly'
                      // Cap at end_date for terminated/expired/open contracts
                      const end = c.end_date ? new Date(c.end_date) : null
                      const nowCapped = end && now > end ? end : now
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

                    // Days left for end date display
                    const daysLeft = c.end_date ? Math.ceil((new Date(c.end_date) - new Date()) / 86400000) : null

                    return (
                      <TableRow key={c.id} className="cursor-pointer" onClick={() => navigate(`/contracts/${c.id}`)}>
                        <TableCell>
                          <p className="font-medium">{c.stands?.code}</p>
                          <p className="text-xs text-muted-foreground">{c.stands?.address?.slice(0,30)}</p>
                        </TableCell>
                        <TableCell>
                          {c.is_open ? (
                            <span className="text-xs font-medium text-info">مفتوح</span>
                          ) : (
                            <span>{c.duration_months} شهر</span>
                          )}
                        </TableCell>
                        <TableCell>{formatDate(c.start_date)}</TableCell>
                        <TableCell>
                          {c.is_open ? (
                            <div>
                              <span className="text-xs font-medium text-info">بدون نهاية</span>
                              <p className="text-xs text-muted-foreground mt-0.5">عقد مفتوح</p>
                            </div>
                          ) : (
                            <div>
                              <p>{formatDate(c.end_date)}</p>
                              {daysLeft !== null && realStatus !== 'expired' && realStatus !== 'terminated' && (
                                <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full mt-0.5 inline-block ${
                                  daysLeft <= 30 ? 'bg-destructive/15 text-destructive' : 
                                  daysLeft <= 90 ? 'bg-warning/15 text-warning' : 
                                  'bg-success/15 text-success'
                                }`}>
                                  {daysLeft} يوم
                                </span>
                              )}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>{c.is_open ? '—' : formatCurrency(c.total_value)}</TableCell>
                        <TableCell className={paid >= safeNum(c.total_value || 0) || (c.is_open && paid > 0) ? 'text-success font-medium' : 'text-muted-foreground'}>{formatCurrency(paid)}</TableCell>
                        <TableCell className={`text-sm font-medium ${periodDue > 0 ? 'text-destructive' : 'text-success'}`}>
                          {formatCurrency(periodDue)}
                        </TableCell>
                        <TableCell className={contractOwed > 0 ? 'text-destructive font-medium' : 'text-success font-medium'}>
                          {formatCurrency(contractOwed)}
                        </TableCell>
                        <TableCell><StatusBadge status={realStatus} /></TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
