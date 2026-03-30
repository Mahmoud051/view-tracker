import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowRight, Plus, XCircle, FileDown, CreditCard, CheckCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatDate, formatCurrency, safeNum, rentalTypeLabels, paymentMethodLabels, contractSerial, computeContractStatus } from '@/lib/utils'
import { useToast } from '@/contexts/ToastContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Textarea } from '@/components/ui/index'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/index'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { LoadingScreen, StatusBadge, FormField, ConfirmDialog, StatCard } from '@/components/ui/shared'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/index'

const EMPTY_PAYMENT = { amount: '', payment_date: new Date().toISOString().split('T')[0], payment_method: 'cash', notes: '' }

export default function ContractDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { toast } = useToast()

  const [contract, setContract] = useState(null)
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false)
  const [paymentForm, setPaymentForm] = useState(EMPTY_PAYMENT)
  const [saving, setSaving] = useState(false)
  const [terminateConfirm, setTerminateConfirm] = useState(false)

  useEffect(() => { fetchAll() }, [id])

  async function fetchAll() {
    setLoading(true)
    const [{ data: c }, { data: p }] = await Promise.all([
      supabase.from('contracts').select('*, stands(*), clients(*)').eq('id', id).single(),
      supabase.from('payments').select('*').eq('contract_id', id).order('payment_date', { ascending: false }),
    ])
    setContract(c)
    setPayments(p || [])
    setLoading(false)
  }

  const totalPaid = payments.reduce((a, p) => a + safeNum(p.amount), 0)
  const remaining = safeNum(contract?.total_value) - totalPaid
  const displayStatus = contract ? computeContractStatus(contract.start_date, contract.end_date, contract.status) : null

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
    </div>
    <div>
      <h2>بيانات العميل</h2>
      <div class="field"><div class="label">الاسم</div><div class="value">${contract.clients?.name || '—'}</div></div>
      <div class="field"><div class="label">الهاتف</div><div class="value">${contract.clients?.phone || '—'}</div></div>
    </div>
  </div>

  <h2>تفاصيل العقد</h2>
  <div class="grid">
    <div class="field"><div class="label">نوع الإيجار</div><div class="value">${rentalTypeLabels[contract.rental_type] || contract.rental_type}</div></div>
    <div class="field"><div class="label">تاريخ البداية</div><div class="value">${formatDate(contract.start_date)}</div></div>
    <div class="field"><div class="label">قيمة العقد الإجمالية</div><div class="value">${formatCurrency(contract.total_value)}</div></div>
    <div class="field"><div class="label">تاريخ النهاية</div><div class="value">${formatDate(contract.end_date)}</div></div>
    <div class="field"><div class="label">المبلغ المدفوع</div><div class="value">${formatCurrency(totalPaid)}</div></div>
    <div class="field"><div class="label">المبلغ المتبقي</div><div class="value" style="color:${remaining > 0 ? '#dc2626' : '#16a34a'}">${formatCurrency(remaining)}</div></div>
  </div>
  ${contract.notes ? `<div style="margin-top:12px;padding:12px;background:#f8fafc;border-radius:8px;font-size:13px;"><b>ملاحظات:</b> ${contract.notes}</div>` : ''}

  <h2>سجل المدفوعات</h2>
  ${payments.length > 0 ? `
  <table>
    <thead><tr><th>#</th><th>التاريخ</th><th>المبلغ</th><th>طريقة الدفع</th><th>ملاحظات</th></tr></thead>
    <tbody>
      ${payments.map((p, i) => `<tr><td>${i + 1}</td><td>${formatDate(p.payment_date)}</td><td>${formatCurrency(p.amount)}</td><td>${paymentMethodLabels[p.payment_method] || p.payment_method}</td><td>${p.notes || '—'}</td></tr>`).join('')}
      <tr class="total-row"><td colspan="2">الإجمالي</td><td>${formatCurrency(totalPaid)}</td><td colspan="2">متبقي: ${formatCurrency(remaining)}</td></tr>
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
          {displayStatus !== 'terminated' && (
            <Button variant="outline" size="sm" onClick={() => setTerminateConfirm(true)} className="text-destructive border-destructive/40 hover:bg-destructive/10">
              <XCircle className="w-4 h-4" /> إنهاء العقد
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={printContract}>
            <FileDown className="w-4 h-4" /> طباعة / PDF
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard title="قيمة العقد" value={formatCurrency(contract.total_value)} icon={CreditCard} variant="default" />
        <StatCard title="المدفوع" value={formatCurrency(totalPaid)} icon={CheckCircle} variant="success" />
        <StatCard title="المتبقي" value={formatCurrency(remaining)} icon={CreditCard} variant={remaining > 0 ? 'danger' : 'success'} />
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
              ['نوع الإيجار', rentalTypeLabels[contract.rental_type]],
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
          <CardTitle className="flex items-center gap-2">
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
                <span className="text-muted-foreground">المتبقي:</span>
                <span className={`font-bold text-base ${remaining > 0 ? 'text-destructive' : 'text-success'}`}>{formatCurrency(remaining)}</span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Add Payment Dialog */}
      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>إضافة دفعة جديدة</DialogTitle></DialogHeader>
          <div className="p-6 space-y-4">
            <FormField label="المبلغ (جنيه)" required>
              <Input type="number" value={paymentForm.amount} onChange={e => setPaymentForm({...paymentForm, amount: e.target.value})} placeholder="0" />
            </FormField>
            <FormField label="تاريخ الدفع">
              <Input type="date" value={paymentForm.payment_date} onChange={e => setPaymentForm({...paymentForm, payment_date: e.target.value})} />
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
          <DialogFooter>
            <Button onClick={addPayment} disabled={saving}>{saving ? 'حفظ...' : 'إضافة الدفعة'}</Button>
            <Button variant="outline" onClick={() => setPaymentDialogOpen(false)}>إلغاء</Button>
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
    </div>
  )
}
