import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowRight, Edit2, Save, X, Phone, FileText } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatDate, formatCurrency, safeNum, rentalTypeLabels } from '@/lib/utils'
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

  const active = contracts.filter(c => c.status === 'active')
  const expired = contracts.filter(c => c.status === 'expired' || c.status === 'terminated')
  const totalValue = contracts.reduce((a, c) => a + safeNum(c.total_value), 0)
  const totalPaid = contracts.reduce((a, c) => a + (paymentsMap[c.id] || 0), 0)
  const remaining = totalValue - totalPaid

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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="عقود نشطة" value={active.length} icon={FileText} variant="success" />
        <StatCard title="عقود منتهية" value={expired.length} icon={FileText} variant="default" />
        <StatCard title="إجمالي المدفوع" value={formatCurrency(totalPaid)} icon={FileText} variant="info" />
        <StatCard title="المتبقي" value={formatCurrency(remaining)} icon={FileText} variant={remaining > 0 ? 'danger' : 'success'} />
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
                    <TableHead>المتبقي</TableHead>
                    <TableHead>الحالة</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contracts.map(c => {
                    const paid = paymentsMap[c.id] || 0
                    const rem = safeNum(c.total_value) - paid
                    return (
                      <TableRow key={c.id} className="cursor-pointer" onClick={() => navigate(`/contracts/${c.id}`)}>
                        <TableCell>
                          <p className="font-medium">{c.stands?.code}</p>
                          <p className="text-xs text-muted-foreground">{c.stands?.address?.slice(0,30)}</p>
                        </TableCell>
                        <TableCell>{rentalTypeLabels[c.rental_type] || c.rental_type}</TableCell>
                        <TableCell>{formatDate(c.start_date)}</TableCell>
                        <TableCell>{formatDate(c.end_date)}</TableCell>
                        <TableCell>{formatCurrency(c.total_value)}</TableCell>
                        <TableCell className="text-success">{formatCurrency(paid)}</TableCell>
                        <TableCell className={rem > 0 ? 'text-destructive' : 'text-success'}>{formatCurrency(rem)}</TableCell>
                        <TableCell><StatusBadge status={c.status} /></TableCell>
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
