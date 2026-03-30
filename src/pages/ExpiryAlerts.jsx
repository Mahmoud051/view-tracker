import { useEffect, useState } from 'react'
import { Bell, Download, AlertTriangle, Calendar } from 'lucide-react'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'
import { formatDate, formatCurrency, daysRemaining, safeNum } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/index'
import { PageHeader, LoadingScreen } from '@/components/ui/shared'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export default function ExpiryAlerts() {
  const [govAlerts, setGovAlerts] = useState([])
  const [contractAlerts, setContractAlerts] = useState([])
  const [loading, setLoading] = useState(true)

  const [govDate, setGovDate] = useState(new Date().toISOString().split('T')[0])
  const [govDays, setGovDays] = useState(30)
  const [contractDate, setContractDate] = useState(new Date().toISOString().split('T')[0])
  const [contractDays, setContractDays] = useState(30)

  useEffect(() => { fetchGovAlerts() }, [govDate, govDays])
  useEffect(() => { fetchContractAlerts() }, [contractDate, contractDays])

  useEffect(() => {
    setLoading(true)
    Promise.all([fetchGovAlerts(), fetchContractAlerts()]).finally(() => setLoading(false))
  }, [])

  async function fetchGovAlerts() {
    const from = govDate
    const to = new Date(new Date(govDate).getTime() + govDays * 86400000).toISOString().split('T')[0]
    const { data } = await supabase
      .from('stands')
      .select('id, code, address, gov_license_number, gov_rental_end')
      .gte('gov_rental_end', from)
      .lte('gov_rental_end', to)
      .order('gov_rental_end')
    setGovAlerts(data || [])
  }

  async function fetchContractAlerts() {
    const from = contractDate
    const to = new Date(new Date(contractDate).getTime() + contractDays * 86400000).toISOString().split('T')[0]
    const { data } = await supabase
      .from('contracts')
      .select('id, end_date, total_value, status, stands(code, address), clients(name, phone), payments(amount)')
      .eq('status', 'active')
      .gte('end_date', from)
      .lte('end_date', to)
      .order('end_date')
    setContractAlerts(data || [])
  }

  function exportGovExcel() {
    const rows = govAlerts.map(s => ({
      'كود اللوحة': s.code,
      'العنوان': s.address,
      'رقم الترخيص': s.gov_license_number || '—',
      'تاريخ الانتهاء': formatDate(s.gov_rental_end),
      'الأيام المتبقية': daysRemaining(s.gov_rental_end) ?? '—',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'تنبيهات الترخيص')
    XLSX.writeFile(wb, 'تنبيهات_الترخيص_الحكومي.xlsx')
  }

  function exportContractExcel() {
    const rows = contractAlerts.map(c => {
      const paid = (c.payments || []).reduce((a, p) => a + safeNum(p.amount), 0)
      return {
        'كود اللوحة': c.stands?.code,
        'العنوان': c.stands?.address,
        'اسم العميل': c.clients?.name,
        'هاتف العميل': c.clients?.phone || '—',
        'تاريخ انتهاء العقد': formatDate(c.end_date),
        'الأيام المتبقية': daysRemaining(c.end_date) ?? '—',
        'المبلغ المتبقي (جنيه)': safeNum(c.total_value) - paid,
      }
    })
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'عقود تنتهي قريباً')
    XLSX.writeFile(wb, 'تنبيهات_انتهاء_العقود.xlsx')
  }

  function urgencyBadge(days) {
    if (days <= 7) return <Badge variant="destructive">{days} أيام</Badge>
    if (days <= 14) return <Badge variant="warning">{days} يوم</Badge>
    return <Badge variant="secondary">{days} يوم</Badge>
  }

  if (loading) return <LoadingScreen />

  return (
    <div className="space-y-8 animate-fade-in">
      <PageHeader title="تنبيهات الانتهاء" description="مراقبة التراخيص والعقود التي تقترب من الانتهاء" />

      {/* Section 1: Gov Permits */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <CardTitle className="flex items-center gap-2 text-warning">
              <AlertTriangle className="w-5 h-5" />
              التراخيص الحكومية المنتهية قريباً
              {govAlerts.length > 0 && (
                <Badge variant="warning">{govAlerts.length}</Badge>
              )}
            </CardTitle>
            <Button size="sm" variant="outline" onClick={exportGovExcel} disabled={govAlerts.length === 0}>
              <Download className="w-4 h-4" /> تصدير Excel
            </Button>
          </div>
          {/* Controls */}
          <div className="flex flex-wrap gap-3 mt-2">
            <div className="flex items-center gap-2">
              <label className="text-sm text-muted-foreground whitespace-nowrap">من تاريخ</label>
              <Input type="date" value={govDate} onChange={e => setGovDate(e.target.value)} className="w-40 h-8 text-xs" />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-muted-foreground whitespace-nowrap">خلال</label>
              <Input type="number" value={govDays} onChange={e => setGovDays(Number(e.target.value))} className="w-20 h-8 text-xs" min={1} max={365} />
              <span className="text-sm text-muted-foreground">يوم</span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {govAlerts.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Bell className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p>لا توجد تراخيص تنتهي خلال هذه الفترة</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>كود اللوحة</TableHead>
                    <TableHead>العنوان</TableHead>
                    <TableHead>رقم الترخيص</TableHead>
                    <TableHead>تاريخ الانتهاء</TableHead>
                    <TableHead>الأيام المتبقية</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {govAlerts.map(s => {
                    const days = daysRemaining(s.gov_rental_end)
                    return (
                      <TableRow key={s.id}>
                        <TableCell className="font-semibold">{s.code}</TableCell>
                        <TableCell className="max-w-[200px] truncate">{s.address}</TableCell>
                        <TableCell>{s.gov_license_number || '—'}</TableCell>
                        <TableCell>{formatDate(s.gov_rental_end)}</TableCell>
                        <TableCell>{days !== null ? urgencyBadge(days) : '—'}</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 2: Client Contracts */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <CardTitle className="flex items-center gap-2 text-destructive">
              <Calendar className="w-5 h-5" />
              عقود العملاء المنتهية قريباً
              {contractAlerts.length > 0 && (
                <Badge variant="destructive">{contractAlerts.length}</Badge>
              )}
            </CardTitle>
            <Button size="sm" variant="outline" onClick={exportContractExcel} disabled={contractAlerts.length === 0}>
              <Download className="w-4 h-4" /> تصدير Excel
            </Button>
          </div>
          <div className="flex flex-wrap gap-3 mt-2">
            <div className="flex items-center gap-2">
              <label className="text-sm text-muted-foreground whitespace-nowrap">من تاريخ</label>
              <Input type="date" value={contractDate} onChange={e => setContractDate(e.target.value)} className="w-40 h-8 text-xs" />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-muted-foreground whitespace-nowrap">خلال</label>
              <Input type="number" value={contractDays} onChange={e => setContractDays(Number(e.target.value))} className="w-20 h-8 text-xs" min={1} max={365} />
              <span className="text-sm text-muted-foreground">يوم</span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {contractAlerts.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Bell className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p>لا توجد عقود تنتهي خلال هذه الفترة</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>كود اللوحة</TableHead>
                    <TableHead>اسم العميل</TableHead>
                    <TableHead>الهاتف</TableHead>
                    <TableHead>تاريخ الانتهاء</TableHead>
                    <TableHead>الأيام المتبقية</TableHead>
                    <TableHead>المبلغ المتبقي</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contractAlerts.map(c => {
                    const days = daysRemaining(c.end_date)
                    const paid = (c.payments || []).reduce((a, p) => a + safeNum(p.amount), 0)
                    const rem = safeNum(c.total_value) - paid
                    return (
                      <TableRow key={c.id}>
                        <TableCell className="font-semibold">{c.stands?.code}</TableCell>
                        <TableCell className="font-medium">{c.clients?.name}</TableCell>
                        <TableCell>{c.clients?.phone || '—'}</TableCell>
                        <TableCell>{formatDate(c.end_date)}</TableCell>
                        <TableCell>{days !== null ? urgencyBadge(days) : '—'}</TableCell>
                        <TableCell className={rem > 0 ? 'text-destructive font-medium' : 'text-success'}>{formatCurrency(rem)}</TableCell>
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
