import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowRight, Plus, XCircle, FileDown, CreditCard, CheckCircle, Pencil, Trash2, PlayCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatDate, formatCurrency, safeNum, paymentMethodLabels, paymentFrequencyLabels, contractSerial, computeContractStatus, toLocalDateStr, paymentIntervalMonths, getDurationCompatibilityError } from '@/lib/utils'
import { useToast } from '@/contexts/ToastContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DateInput } from '@/components/ui'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Textarea } from '@/components/ui/index'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/index'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { LoadingScreen, StatusBadge, FormField, ConfirmDialog, StatCard } from '@/components/ui/shared'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/index'

const INTERVAL_MONTHS = paymentIntervalMonths

const INTERVAL_LABELS = {
  monthly: 'شهري (كل شهر)',
  quarterly: 'ربع سنوي (كل 3 أشهر)',
  semi_annual: 'نصف سنوي (كل 6 أشهر)',
  annual: 'سنوي (كل 12 شهر)',
}

const EMPTY_PAYMENT = { amount: '', payment_date: toLocalDateStr(new Date()), payment_method: 'cash', notes: '' }

export default function ContractDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { toast } = useToast()

  const [contract, setContract] = useState(null)
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false)
  const [paymentForm, setPaymentForm] = useState(EMPTY_PAYMENT)
  const [editingPayment, setEditingPayment] = useState(null)
  const [saving, setSaving] = useState(false)
  const [terminateConfirm, setTerminateConfirm] = useState(false)
  const [deletePaymentConfirm, setDeletePaymentConfirm] = useState(null)
  const [deleteContractConfirm, setDeleteContractConfirm] = useState(false)
  const [editContractOpen, setEditContractOpen] = useState(false)
  const [editContractForm, setEditContractForm] = useState({})
  const [editFormErrors, setEditFormErrors] = useState({})
  const [allStands, setAllStands] = useState([])
  const [allClients, setAllClients] = useState([])

  useEffect(() => { fetchAll() }, [id])

  async function fetchAll() {
    setLoading(true)
    const [{ data: c }, { data: p }, { data: s }, { data: cl }] = await Promise.all([
      supabase.from('contracts').select('*, stands(*), clients(*)').eq('id', id).single(),
      supabase.from('payments').select('*').eq('contract_id', id).order('payment_date', { ascending: false }),
      supabase.from('stands').select('id, code, address, is_active').order('code'),
      supabase.from('clients').select('id, name, phone').order('name'),
    ])
    setContract(c)
    setPayments(p || [])
    setAllStands((s || []).filter(stand => stand.is_active !== false))
    setAllClients(cl || [])
    if (c) {
      setEditContractForm({
        stand_id: c.stand_id,
        client_id: c.client_id,
        start_date: c.start_date,
        duration_months: c.duration_months || '',
        end_date: c.end_date,
        payment_frequency: c.payment_frequency,
        monthly_rate: c.monthly_rate || '',
        total_value: c.total_value,
        price_per_period: c.price_per_period || '',
        notes: c.notes || '',
      })
    }
    setLoading(false)
  }

  const totalPaid = payments.reduce((a, p) => a + safeNum(p.amount), 0)
  const balance = totalPaid - safeNum(contract?.total_value)
  const displayStatus = contract ? computeContractStatus(contract.start_date, contract.end_date, contract.status) : null

  // Period-based amount due (how much should be paid by now based on payment cycle)
  let periodDue = 0
  if (contract && displayStatus === 'active' && contract.start_date && contract.payment_frequency) {
    const INTERVAL_MONTHS = { monthly: 1, quarterly: 3, semi_annual: 6, annual: 12 }
    const now = new Date()
    const start = new Date(contract.start_date)
    const end = contract.end_date ? new Date(contract.end_date) : null
    const nowCapped = end && now > end ? end : now
    const monthlyRate = safeNum(contract.total_value) / (parseInt(contract.duration_months) || 1)
    const intervalMonths = INTERVAL_MONTHS[contract.payment_frequency] || 1
    const periodRate = monthlyRate * intervalMonths
    const rawMonths = (nowCapped.getFullYear() - start.getFullYear()) * 12 + (nowCapped.getMonth() - start.getMonth())
    const completeMonths = nowCapped.getDate() >= start.getDate() ? rawMonths + 1 : rawMonths
    const totalPeriods = Math.ceil((parseInt(contract.duration_months) || 1) / intervalMonths)
    const periodsDue = Math.min(Math.ceil(completeMonths / intervalMonths), totalPeriods)
    periodDue = Math.max(0, periodsDue * periodRate - totalPaid)
  }

  async function addPayment() {
    if (!paymentForm.amount || isNaN(paymentForm.amount)) {
      toast({ title: 'خطأ', description: 'المبلغ مطلوب', variant: 'error' }); return
    }
    setSaving(true)
    const { error } = await supabase.from('payments').insert([{
      contract_id: id,
      amount: parseFloat(paymentForm.amount),
      payment_date: paymentForm.payment_date,
      payment_method: paymentForm.payment_method,
      notes: paymentForm.notes || null,
    }])
    if (!error) {
      toast({ title: 'تم إضافة الدفعة', variant: 'success' })
      setPaymentDialogOpen(false)
      setPaymentForm(EMPTY_PAYMENT)
      fetchAll()
    } else {
      toast({ title: 'خطأ', description: error.message, variant: 'error' })
    }
    setSaving(false)
  }

  async function terminateContract() {
    const { error } = await supabase.from('contracts').update({ status: 'terminated' }).eq('id', id)
    if (!error) {
      toast({ title: 'تم إنهاء العقد', variant: 'success' })
      setTerminateConfirm(false)
      fetchAll()
    }
  }

  function updateEndDate(startDate, durationMonths, monthlyRate, interval) {
    if (!startDate || !durationMonths) { setEditContractForm(f => ({ ...f, end_date: '', total_value: '', price_per_period: '' })); return }
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
      setEditContractForm(f => ({ ...f, end_date: endStr, total_value: total > 0 ? total.toFixed(2) : '', price_per_period: perPeriod > 0 ? perPeriod.toFixed(2) : '' }))
    } catch { setEditContractForm(f => ({ ...f, end_date: '', total_value: '', price_per_period: '' })) }
  }

  function validateEditContractForm() {
    const errs = {}
    if (!editContractForm.stand_id) errs.stand_id = 'اختر اللوحة'
    if (!editContractForm.client_id) errs.client_id = 'اختر العميل'
    if (!editContractForm.start_date) errs.start_date = 'تاريخ البداية مطلوب'
    const durationError = getDurationCompatibilityError(editContractForm.duration_months, editContractForm.payment_frequency)
    if (durationError) errs.duration_months = durationError
    if (!editContractForm.monthly_rate || isNaN(editContractForm.monthly_rate) || parseFloat(editContractForm.monthly_rate) <= 0) {
      errs.monthly_rate = 'السعر الشهري مطلوب'
    }
    setEditFormErrors(errs)
    return Object.keys(errs).length === 0
  }

  // Can start contract manually? Only upcoming contracts, and only if the stand has no active contract
  // We fetch the stand's active contract to determine this
  const [standActive, setStandActive] = useState(null)
  useEffect(() => {
    if (contract && contract.status === 'upcoming' && contract.stand_id) {
      supabase.from('contracts').select('id').eq('stand_id', contract.stand_id).eq('status', 'active').limit(1).then(({ data }) => {
        setStandActive(data && data.length > 0 ? data[0] : null)
      })
    } else {
      setStandActive(null)
    }
  }, [contract])

  const canStartManual = contract?.status === 'upcoming' && !standActive

  async function startContractNow() {
    const today = toLocalDateStr(new Date())
    const { error } = await supabase.from('contracts').update({ status: 'active', start_date: today }).eq('id', id)
    if (!error) {
      toast({ title: 'تم تفعيل العقد', description: `يبدأ من ${today}`, variant: 'success' })
      fetchAll()
    } else {
      toast({ title: 'خطأ', description: error.message, variant: 'error' })
    }
  }

  function openEditPayment(p) {
    setEditingPayment(p.id)
    setPaymentForm({ amount: p.amount, payment_date: p.payment_date, payment_method: p.payment_method, notes: p.notes || '' })
    setPaymentDialogOpen(true)
  }

  async function saveEditedPayment() {
    if (!paymentForm.amount || isNaN(paymentForm.amount)) { toast({ title: 'خطأ', description: 'المبلغ مطلوب', variant: 'error' }); return }
    setSaving(true)
    const { error } = await supabase.from('payments').update({
      amount: parseFloat(paymentForm.amount),
      payment_date: paymentForm.payment_date,
      payment_method: paymentForm.payment_method,
      notes: paymentForm.notes || null,
    }).eq('id', editingPayment)
    if (!error) {
      toast({ title: 'تم التحديث', variant: 'success' })
      setPaymentDialogOpen(false)
      setEditingPayment(null)
      setPaymentForm(EMPTY_PAYMENT)
      fetchAll()
    } else {
      toast({ title: 'خطأ', description: error.message, variant: 'error' })
    }
    setSaving(false)
  }

  async function deletePayment(pId) {
    await supabase.from('payments').delete().eq('id', pId)
    toast({ title: 'تم حذف الدفعة', variant: 'success' })
    setDeletePaymentConfirm(null)
    fetchAll()
  }

  async function saveEditedContract() {
    if (!validateEditContractForm()) return
    setSaving(true)
    try {
      const { error } = await supabase.from('contracts').update({
        stand_id: editContractForm.stand_id,
        client_id: editContractForm.client_id,
        start_date: editContractForm.start_date,
        end_date: editContractForm.end_date,
        duration_months: parseInt(editContractForm.duration_months) || null,
        payment_frequency: editContractForm.payment_frequency,
        monthly_rate: parseFloat(editContractForm.monthly_rate) || 0,
        price_per_period: parseFloat(editContractForm.price_per_period) || 0,
        total_value: parseFloat(editContractForm.total_value) || 0,
        notes: editContractForm.notes || null,
      }).eq('id', id)
      if (error) throw error
      toast({ title: 'تم تحديث العقد', variant: 'success' })
      setEditContractOpen(false)
      setEditFormErrors({})
      fetchAll()
    } catch (e) { toast({ title: 'خطأ', description: e.message, variant: 'error' }) }
    setSaving(false)
  }

  async function deleteContract() {
    // Delete all payments first
    await supabase.from('payments').delete().eq('contract_id', id)
    const { error } = await supabase.from('contracts').delete().eq('id', id)
    if (!error) {
      toast({ title: 'تم حذف العقد والمدفوعات', variant: 'success' })
      navigate('/contracts')
    } else {
      toast({ title: 'خطأ', description: error.message, variant: 'error' })
    }
    setDeleteContractConfirm(false)
  }

  function printContract() {
    if (!contract) return
    const html = `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8"/>
  <title>عقد إيجار — ${contractSerial(contract.id)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Cairo', Arial, sans-serif; direction: rtl; color: #1e293b; background: #fff; padding: 40px; }
    .header { text-align: center; border-bottom: 3px solid #1E3A5F; padding-bottom: 20px; margin-bottom: 30px; }
    .company { font-size: 36px; font-weight: 900; color: #1E3A5F; letter-spacing: -1px; }
    .subtitle { font-size: 14px; color: #64748b; margin-top: 4px; }
    h2 { font-size: 20px; font-weight: 700; margin: 20px 0 12px; color: #1E3A5F; border-right: 4px solid #1E3A5F; padding-right: 10px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 20px; }
    .field { margin-bottom: 8px; }
    .label { font-size: 11px; color: #64748b; text-transform: uppercase; }
    .value { font-size: 14px; font-weight: 600; color: #1e293b; }
    .badge { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 12px; font-weight: 700; }
    .active { background: #dcfce7; color: #16a34a; }
    .expired { background: #fee2e2; color: #dc2626; }
    .upcoming { background: #dbeafe; color: #2563eb; }
    .terminated { background: #f1f5f9; color: #64748b; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th { background: #f1f5f9; padding: 8px 12px; font-size: 12px; font-weight: 700; text-align: right; border: 1px solid #e2e8f0; }
    td { padding: 8px 12px; font-size: 13px; border: 1px solid #e2e8f0; }
    tr:nth-child(even) td { background: #f8fafc; }
    .total-row { background: #1E3A5F !important; color: white; font-weight: 700; }
    .total-row td { color: white !important; border-color: #1E3A5F; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 12px; color: #94a3b8; }
    .sig-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 40px; }
    .sig-box { border-top: 2px solid #1E3A5F; padding-top: 8px; text-align: center; font-size: 13px; font-weight: 600; color: #475569; }
  </style>
</head>
<body>
  <div class="header">
    <div class="company">View</div>
    <div class="subtitle">نظام إدارة اللوحات الإعلانية</div>
    <div style="font-size:13px;color:#64748b;margin-top:6px;">عقد إيجار رقم: ${contractSerial(contract.id)}</div>
    <div style="font-size:12px;color:#94a3b8;">تاريخ الطباعة: ${formatDate(new Date().toISOString())}</div>
  </div>

  <div class="grid">
    <div>
      <h2>بيانات اللوحة</h2>
      <div class="field"><div class="label">الكود</div><div class="value">${contract.stands?.code || '—'}</div></div>
      <div class="field"><div class="label">العنوان</div><div class="value">${contract.stands?.address || '—'}</div></div>
      <div class="field"><div class="label">المساحة</div><div class="value">${safeNum(contract.stands?.width) * safeNum(contract.stands?.height)} م²</div></div>
      <div class="field"><div class="label">الأبعاد</div><div class="value">${contract.stands?.width} م × ${contract.stands?.height} م</div></div>
      <div class="field"><div class="label">عدد الأوجه</div><div class="value">${contract.stands?.sides == 2 ? 'وجهين' : 'وجه واحد'}</div></div>
    </div>
    <div>
      <h2>بيانات العميل</h2>
      <div class="field"><div class="label">الاسم</div><div class="value">${contract.clients?.name || '—'}</div></div>
      <div class="field"><div class="label">الهاتف</div><div class="value">${contract.clients?.phone || '—'}</div></div>
    </div>
  </div>

  <h2>تفاصيل العقد</h2>
  <div class="grid">
    <div class="field"><div class="label">مدة العقد</div><div class="value">${contract.duration_months || '—'} شهر</div></div>
    <div class="field"><div class="label">نظام الدفع</div><div class="value">${paymentFrequencyLabels[contract.payment_frequency] || contract.payment_frequency}</div></div>
    <div class="field"><div class="label">تاريخ البداية</div><div class="value">${formatDate(contract.start_date)}</div></div>
    <div class="field"><div class="label">قيمة العقد الإجمالية</div><div class="value">${formatCurrency(contract.total_value)}</div></div>
    <div class="field"><div class="label">تاريخ النهاية</div><div class="value">${formatDate(contract.end_date)}</div></div>
    <div class="field"><div class="label">المبلغ المدفوع</div><div class="value">${formatCurrency(totalPaid)}</div></div>
    <div class="field"><div class="label">${balance >= 0 ? 'له / رصيد مدفوع' : 'عليه / مستحق'}</div><div class="value" style="color:${balance >= 0 ? '#16a34a' : '#dc2626'}">${formatCurrency(Math.abs(balance))}</div></div>
  </div>
  ${contract.notes ? `<div style="margin-top:12px;padding:12px;background:#f8fafc;border-radius:8px;font-size:13px;"><b>ملاحظات:</b> ${contract.notes}</div>` : ''}

  <h2>سجل المدفوعات</h2>
  ${payments.length > 0 ? `
  <table>
    <thead><tr><th>#</th><th>التاريخ</th><th>المبلغ</th><th>طريقة الدفع</th><th>ملاحظات</th></tr></thead>
    <tbody>
      ${payments.map((p, i) => `<tr><td>${i + 1}</td><td>${formatDate(p.payment_date)}</td><td>${formatCurrency(p.amount)}</td><td>${paymentMethodLabels[p.payment_method] || p.payment_method}</td><td>${p.notes || '—'}</td></tr>`).join('')}
      <tr class="total-row"><td colspan="2">الإجمالي</td><td>${formatCurrency(totalPaid)}</td><td colspan="2">${balance >= 0 ? 'له:' : 'عليه:'} ${formatCurrency(Math.abs(balance))}</td></tr>
    </tbody>
  </table>` : '<p style="color:#94a3b8;font-size:13px;">لا توجد مدفوعات مسجلة</p>'}

  <div class="sig-grid">
    <div class="sig-box">توقيع العميل<br/>${contract.clients?.name}</div>
    <div class="sig-box">توقيع الشركة<br/>View</div>
  </div>
  <div class="footer">View — نظام إدارة اللوحات الإعلانية © ${new Date().getFullYear()}</div>
</body>
</html>`

    const win = window.open('', '_blank')
    win.document.write(html)
    win.document.close()
    win.print()
  }

  if (loading) return <LoadingScreen />
  if (!contract) return <div className="p-8 text-center text-muted-foreground">العقد غير موجود</div>

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="ghost" size="icon" onClick={() => navigate('/contracts')}>
          <ArrowRight className="w-4 h-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-foreground">عقد {contractSerial(contract.id)}</h1>
            <StatusBadge status={displayStatus} />
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {contract.stands?.code} — {contract.clients?.name}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {displayStatus === 'upcoming' && (
            <Button size="sm" onClick={startContractNow} disabled={!canStartManual} className="bg-primary hover:bg-primary/90">
              <PlayCircle className="w-4 h-4" /> تفعيل العقد الآن {!canStartManual && '(العقد السابق نشط)'}
            </Button>
          )}
          {displayStatus !== 'terminated' && (
            <Button variant="outline" size="sm" onClick={() => setEditContractOpen(true)}>
              <Pencil className="w-4 h-4" /> تعديل
            </Button>
          )}
          {displayStatus === 'active' && (
            <Button variant="outline" size="sm" onClick={() => setTerminateConfirm(true)} className="text-destructive border-destructive/40 hover:bg-destructive/10">
              <XCircle className="w-4 h-4" /> إنهاء العقد
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setDeleteContractConfirm(true)} className="text-destructive border-destructive/40 hover:bg-destructive/10">
            <Trash2 className="w-4 h-4" /> حذف العقد
          </Button>
          <Button variant="outline" size="sm" onClick={printContract}>
            <FileDown className="w-4 h-4" /> طباعة / PDF
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="قيمة العقد" value={formatCurrency(contract.total_value)} icon={CreditCard} variant="default" />
        <StatCard title="المدفوع" value={formatCurrency(totalPaid)} icon={CheckCircle} variant="success" />
        <StatCard
          title="مستحق الآن"
          value={formatCurrency(periodDue)}
          icon={CreditCard}
          variant={periodDue > 0 ? 'danger' : 'success'}
        />
        <StatCard
          title="مدة العقد"
          value={`${contract.duration_months || '—'} شهر`}
          icon={CreditCard}
          variant="info"
        />
      </div>

      {/* Contract Details */}
      <Card>
        <CardHeader><CardTitle>تفاصيل العقد</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {[
              ['اللوحة', `${contract.stands?.code}`],
              ['العنوان', contract.stands?.address],
              ['العميل', contract.clients?.name],
              ['الهاتف', contract.clients?.phone],
              ['مدة العقد', `${contract.duration_months || '—'} شهر`],
              ['فترة الدفع', INTERVAL_LABELS[contract.payment_frequency]?.split('(')[0].trim() || paymentFrequencyLabels[contract.payment_frequency] || contract.payment_frequency],
              ['السعر الشهري', contract.monthly_rate ? formatCurrency(contract.monthly_rate) : '—'],
              ['قيمة الدفعة', contract.price_per_period ? formatCurrency(contract.price_per_period) : '—'],
              ['تاريخ البداية', formatDate(contract.start_date)],
              ['تاريخ النهاية', formatDate(contract.end_date)],
            ].map(([k, v]) => (
              <div key={k}>
                <p className="text-xs text-muted-foreground">{k}</p>
                <p className="font-semibold text-foreground text-sm mt-0.5">{v || '—'}</p>
              </div>
            ))}
          </div>
          {contract.notes && (
            <div className="mt-4 p-3 bg-muted rounded-xl">
              <p className="text-xs text-muted-foreground mb-1">ملاحظات</p>
              <p className="text-sm text-foreground">{contract.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payments */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex flex-row-reverse items-center gap-2">
            <CreditCard className="w-5 h-5 text-primary" />
            سجل المدفوعات
          </CardTitle>
          {displayStatus !== 'terminated' && (
            <Button size="sm" onClick={() => setPaymentDialogOpen(true)}>
              <Plus className="w-4 h-4" /> إضافة دفعة
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {payments.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <CreditCard className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p>لا توجد مدفوعات مسجلة</p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>التاريخ</TableHead>
                    <TableHead>المبلغ</TableHead>
                    <TableHead>طريقة الدفع</TableHead>
                    <TableHead>ملاحظات</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((p, i) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium text-muted-foreground">{i + 1}</TableCell>
                      <TableCell>{formatDate(p.payment_date)}</TableCell>
                      <TableCell className="font-semibold text-success">{formatCurrency(p.amount)}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{paymentMethodLabels[p.payment_method]}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{p.notes || '—'}</TableCell>
                      <TableCell>
                        <div className="flex gap-1 justify-end">
                          <Button size="icon-sm" variant="ghost" onClick={() => openEditPayment(p)} title="تعديل">
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="icon-sm" variant="ghost" onClick={() => setDeletePaymentConfirm(p.id)} className="text-destructive hover:text-destructive" title="حذف">
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Separator className="my-4" />
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">إجمالي المدفوع:</span>
                <span className="font-bold text-success text-base">{formatCurrency(totalPaid)}</span>
              </div>
              <div className="flex items-center justify-between text-sm mt-2">
                <span className="text-muted-foreground">{balance >= 0 ? 'له / رصيد مدفوع:' : 'عليه / مستحق:'}</span>
                <span className={`font-bold text-base ${balance >= 0 ? 'text-success' : 'text-destructive'}`}>{formatCurrency(Math.abs(balance))}</span>
              </div>
            </>          )}
        </CardContent>
      </Card>

      {/* Add/Edit Payment Dialog */}
      <Dialog open={paymentDialogOpen} onOpenChange={v => { setPaymentDialogOpen(v); if (!v) { setEditingPayment(null); setPaymentForm(EMPTY_PAYMENT) } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editingPayment ? 'تعديل الدفعة' : 'إضافة دفعة جديدة'}</DialogTitle></DialogHeader>
          <div className="p-6 space-y-4">
            <FormField label="المبلغ (جنيه)" required>
              <Input type="number" value={paymentForm.amount} onChange={e => setPaymentForm({...paymentForm, amount: e.target.value})} placeholder="0" />
            </FormField>
            <FormField label="تاريخ الدفع">
              <DateInput value={paymentForm.payment_date} onChange={e => setPaymentForm({...paymentForm, payment_date: e.target.value})} />
            </FormField>
            <FormField label="طريقة الدفع">
              <Select value={paymentForm.payment_method} onValueChange={v => setPaymentForm({...paymentForm, payment_method: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">نقداً</SelectItem>
                  <SelectItem value="transfer">تحويل بنكي</SelectItem>
                  <SelectItem value="other">أخرى</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="ملاحظات">
              <Textarea value={paymentForm.notes} onChange={e => setPaymentForm({...paymentForm, notes: e.target.value})} rows={2} />
            </FormField>
          </div>
          <DialogFooter className="justify-end">
            <Button variant="outline" onClick={() => { setPaymentDialogOpen(false); setEditingPayment(null); setPaymentForm(EMPTY_PAYMENT) }}>إلغاء</Button>
            <Button onClick={editingPayment ? saveEditedPayment : addPayment} disabled={saving}>{saving ? 'حفظ...' : (editingPayment ? 'تحديث الدفعة' : 'إضافة الدفعة')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={terminateConfirm}
        onOpenChange={setTerminateConfirm}
        title="إنهاء العقد مبكراً"
        description="هل أنت متأكد من إنهاء هذا العقد قبل تاريخ انتهائه؟ لا يمكن التراجع عن هذا الإجراء."
        confirmText="إنهاء العقد"
        onConfirm={terminateContract}
      />

      <ConfirmDialog
        open={deletePaymentConfirm !== null}
        onOpenChange={() => setDeletePaymentConfirm(null)}
        title="حذف الدفعة"
        description="هل أنت متأكد من حذف هذه الدفعة؟ لا يمكن التراجع عن هذا الإجراء."
        confirmText="حذف الدفعة"
        onConfirm={() => deletePayment(deletePaymentConfirm)}
      />

      <ConfirmDialog
        open={deleteContractConfirm}
        onOpenChange={setDeleteContractConfirm}
        title="حذف العقد نهائياً"
        description="هل أنت متأكد من حذف هذا العقد وجميع مدفوعاته؟ لا يمكن التراجع عن هذا الإجراء."
        confirmText="حذف العقد"
        onConfirm={deleteContract}
      />

      {/* Edit Contract Dialog */}
      <Dialog open={editContractOpen} onOpenChange={(v) => { setEditContractOpen(v); if (!v) setEditFormErrors({}) }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>تعديل العقد</DialogTitle></DialogHeader>
          <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[60vh] overflow-y-auto">
            <FormField label="اللوحة الإعلانية" error={editFormErrors.stand_id}>
              <Select value={editContractForm.stand_id} onValueChange={v => setEditContractForm({...editContractForm, stand_id: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {allStands.map(s => <SelectItem key={s.id} value={s.id}>{s.code} — {s.address?.slice(0,30)}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="العميل" error={editFormErrors.client_id}>
              <Select value={editContractForm.client_id} onValueChange={v => setEditContractForm({...editContractForm, client_id: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {allClients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="تاريخ البداية" error={editFormErrors.start_date}>
              <DateInput value={editContractForm.start_date} onChange={e => { setEditContractForm({...editContractForm, start_date: e.target.value}); updateEndDate(e.target.value, editContractForm.duration_months, editContractForm.monthly_rate, editContractForm.payment_frequency) }} />
            </FormField>
            <FormField label="مدة العقد (أشهر)" error={editFormErrors.duration_months}>
              <Input type="number" value={editContractForm.duration_months} min="1" onChange={e => { setEditContractForm({...editContractForm, duration_months: e.target.value}); updateEndDate(editContractForm.start_date, e.target.value, editContractForm.monthly_rate, editContractForm.payment_frequency) }} />
            </FormField>
            <FormField label="تاريخ النهاية">
              <DateInput value={editContractForm.end_date} readOnly className="bg-muted cursor-not-allowed" />
            </FormField>
            <FormField label="فترة الدفع">
              <Select value={editContractForm.payment_frequency} onValueChange={v => { setEditContractForm({...editContractForm, payment_frequency: v}); updateEndDate(editContractForm.start_date, editContractForm.duration_months, editContractForm.monthly_rate, v) }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(INTERVAL_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="السعر الشهري (جنيه)" error={editFormErrors.monthly_rate}>
              <Input type="number" value={editContractForm.monthly_rate} onChange={e => { setEditContractForm({...editContractForm, monthly_rate: e.target.value}); updateEndDate(editContractForm.start_date, editContractForm.duration_months, e.target.value, editContractForm.payment_frequency) }} />
            </FormField>
            <FormField label={`قيمة الدفعة (${INTERVAL_LABELS[editContractForm.payment_frequency]?.split('(')[0].trim() || '—'})`}>
              <Input type="number" value={editContractForm.price_per_period} readOnly className="bg-muted cursor-not-allowed font-bold text-success" />
            </FormField>
            <FormField label="القيمة الإجمالية">
              <Input type="number" value={editContractForm.total_value} readOnly className="bg-muted cursor-not-allowed font-bold text-lg" />
            </FormField>
            <FormField label="ملاحظات" className="sm:col-span-2">
              <Textarea value={editContractForm.notes} onChange={e => setEditContractForm({...editContractForm, notes: e.target.value})} rows={3} />
            </FormField>
          </div>
          <DialogFooter className="justify-end">
            <Button variant="outline" onClick={() => setEditContractOpen(false)}>إلغاء</Button>
            <Button onClick={saveEditedContract} disabled={saving}>{saving ? 'حفظ...' : 'تحديث العقد'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
