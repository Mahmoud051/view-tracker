import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Download, BarChart3, FileText, Wrench, TrendingUp } from 'lucide-react'
import * as XLSX from 'xlsx'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { supabase } from '@/lib/supabase'
import { formatDate, formatCurrency, safeNum, getLast6MonthsLabels, statusLabels, toLocalDateStr, computeContractStatus } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DateInput } from '@/components/ui'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/index'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/index'
import { PageHeader, LoadingScreen, StatCard } from '@/components/ui/shared'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

function DateRangeFilter({ from, to, onFromChange, onToChange }) {
  return (
    <div className="flex flex-wrap gap-3 items-center">
      <div className="flex items-center gap-2">
        <label className="text-sm text-muted-foreground">من:</label>
        <DateInput value={from} onChange={e => onFromChange(e.target.value)} className="h-8 text-xs w-36" />
      </div>
      <div className="flex items-center gap-2">
        <label className="text-sm text-muted-foreground">إلى:</label>
        <DateInput value={to} onChange={e => onToChange(e.target.value)} className="h-8 text-xs w-36" />
      </div>
    </div>
  )
}

const now = new Date()
const defaultFrom = toLocalDateStr(new Date(now.getFullYear(), now.getMonth() - 5, 1))
const defaultTo = toLocalDateStr(now)

export default function Reports() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)

  // Revenue report
  const [revFrom, setRevFrom] = useState(defaultFrom)
  const [revTo, setRevTo] = useState(defaultTo)
  const [revData, setRevData] = useState(null)

  // Contracts report
  const [ctFrom, setCtFrom] = useState(defaultFrom)
  const [ctTo, setCtTo] = useState(defaultTo)
  const [ctData, setCtData] = useState(null)

  // Maintenance report
  const [mntFrom, setMntFrom] = useState(defaultFrom)
  const [mntTo, setMntTo] = useState(defaultTo)
  const [mntData, setMntData] = useState(null)

  useEffect(() => { fetchAll() }, [])
  useEffect(() => { fetchRevenue() }, [revFrom, revTo])
  useEffect(() => { fetchContracts() }, [ctFrom, ctTo])
  useEffect(() => { fetchMaintenance() }, [mntFrom, mntTo])

  async function fetchAll() {
    setLoading(true)
    await Promise.all([fetchRevenue(), fetchContracts(), fetchMaintenance()])
    setLoading(false)
  }

  async function fetchRevenue() {
    const { data: payments } = await supabase
      .from('payments')
      .select('amount, payment_date, contracts(stand_id, stands(code, address))')
      .gte('payment_date', revFrom)
      .lte('payment_date', revTo)

    const total = (payments || []).reduce((a, p) => a + safeNum(p.amount), 0)

    // By stand
    const byStand = {}
    ;(payments || []).forEach(p => {
      const code = p.contracts?.stands?.code || 'غير محدد'
      const addr = p.contracts?.stands?.address || ''
      if (!byStand[code]) byStand[code] = { code, address: addr, total: 0 }
      byStand[code].total += safeNum(p.amount)
    })

    // Monthly
    const monthMap = {}
    ;(payments || []).forEach(p => {
      const d = new Date(p.payment_date)
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
      monthMap[key] = (monthMap[key] || 0) + safeNum(p.amount)
    })
    const chartData = Object.entries(monthMap).sort().map(([k, v]) => ({ name: k, total: v }))

    setRevData({ total, byStand: Object.values(byStand), chartData })
  }

  async function fetchContracts() {
    const { data: contracts } = await supabase
      .from('contracts')
      .select('*, stands(code, address), clients(name, phone), payments(amount)')
      .gte('created_at', ctFrom + 'T00:00:00')
      .lte('created_at', ctTo + 'T23:59:59')

    const contractsList = contracts || []
    const total = contractsList.length
    const totalValue = contractsList.reduce((a, c) => a + safeNum(c.total_value), 0)
    const totalPaid = contractsList.reduce((a, c) =>
      a + (c.payments || []).reduce((b, p) => b + safeNum(p.amount), 0), 0)
    const totalOwed = Math.max(0, totalValue - totalPaid)

    // Period-based amount due across active contracts in this report's scope
    const INTERVAL_MONTHS = { monthly: 1, quarterly: 3, semi_annual: 6, annual: 12 }
    const now = new Date()
    const periodDue = contractsList.filter(c => computeContractStatus(c.start_date, c.end_date, c.status) === 'active').reduce((acc, c) => {
      if (!c.start_date || !c.payment_frequency) return acc
      const start = new Date(c.start_date)
      const end = c.end_date ? new Date(c.end_date) : null
      const nowCapped = end && now > end ? end : now
      const monthlyRate = safeNum(c.total_value) / (parseInt(c.duration_months) || 1)
      const intervalMonths = INTERVAL_MONTHS[c.payment_frequency] || 1
      const periodRate = monthlyRate * intervalMonths
      const paid = (c.payments || []).reduce((b, p) => b + safeNum(p.amount), 0)
      const rawMonths = (nowCapped.getFullYear() - start.getFullYear()) * 12 + (nowCapped.getMonth() - start.getMonth())
      const completeMonths = nowCapped.getDate() >= start.getDate() ? rawMonths + 1 : rawMonths
      const totalPeriods = Math.ceil((parseInt(c.duration_months) || 1) / intervalMonths)
      const periodsDue = Math.min(Math.ceil(completeMonths / intervalMonths), totalPeriods)
      return acc + Math.max(0, periodsDue * periodRate - paid)
    }, 0)

    setCtData({ total, totalValue, totalPaid, totalOwed, periodDue, contracts: contractsList })
  }

  async function fetchMaintenance() {
    const { data: records } = await supabase
      .from('maintenance_records')
      .select('*, stands(code, address)')
      .gte('date', mntFrom)
      .lte('date', mntTo)

    const total = (records || []).reduce((a, r) => a + safeNum(r.cost), 0)
    const paid = (records || []).filter(r => r.is_paid).reduce((a, r) => a + safeNum(r.cost), 0)

    const byStand = {}
    ;(records || []).forEach(r => {
      const code = r.stands?.code || 'غير محدد'
      if (!byStand[code]) byStand[code] = { code, address: r.stands?.address || '', total: 0, paid: 0, unpaid: 0 }
      byStand[code].total += safeNum(r.cost)
      if (r.is_paid) byStand[code].paid += safeNum(r.cost)
      else byStand[code].unpaid += safeNum(r.cost)
    })

    setMntData({ total, paid, unpaid: total - paid, byStand: Object.values(byStand), records: records || [] })
  }

  function exportRevExcel() {
    const wb = XLSX.utils.book_new()
    const summary = [['إجمالي الإيرادات', revData.total], ['الفترة من', revFrom], ['إلى', revTo]]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), 'ملخص')
    const byStandRows = revData.byStand.map(s => ({ 'كود اللوحة': s.code, 'العنوان': s.address, 'الإجمالي (جنيه)': s.total }))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(byStandRows), 'تفاصيل اللوحات')
    XLSX.writeFile(wb, 'تقرير_الإيرادات.xlsx')
  }

  function exportCtExcel() {
    const rows = (ctData?.contracts || []).map(c => {
      const paid = (c.payments || []).reduce((a, p) => a + safeNum(p.amount), 0)
      let periodDue = 0
      const realStatus = computeContractStatus(c.start_date, c.end_date, c.status)
      if (realStatus === 'active' && c.start_date && c.payment_frequency) {
        const INTERVAL_MONTHS = { monthly: 1, quarterly: 3, semi_annual: 6, annual: 12 }
        const now = new Date()
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
        periodDue = Math.max(0, periodsDue * periodRate - paid)
      }
      return {
        'كود اللوحة': c.stands?.code,
        'العميل': c.clients?.name,
        'مدة العقد (شهر)': c.duration_months || '—',
        'البداية': formatDate(c.start_date),
        'النهاية': formatDate(c.end_date),
        'القيمة (جنيه)': safeNum(c.total_value),
        'المدفوع (جنيه)': paid,
        'مستحق الآن (جنيه)': periodDue,
        'الباقي على العقد (جنيه)': Math.max(0, safeNum(c.total_value) - paid),
        'الحالة': statusLabels[c.status] || c.status,
      }
    })
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'العقود')
    XLSX.writeFile(wb, 'تقرير_العقود.xlsx')
  }

  function exportMntExcel() {
    const rows = (mntData?.records || []).map(r => ({
      'كود اللوحة': r.stands?.code,
      'التاريخ': formatDate(r.date),
      'الوصف': r.description,
      'الفني': r.technician_name || '—',
      'التكلفة (جنيه)': safeNum(r.cost),
      'مدفوع': r.is_paid ? 'نعم' : 'لا',
    }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'الصيانة')
    XLSX.writeFile(wb, 'تقرير_الصيانة.xlsx')
  }

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload?.length) {
      return (
        <div className="bg-card border border-border rounded-xl p-3 shadow-xl">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="font-bold text-foreground">{formatCurrency(payload[0].value)}</p>
        </div>
      )
    }
    return null
  }

  if (loading) return <LoadingScreen />

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="التقارير" description="تحليل شامل للإيرادات والعقود والصيانة" />

      <Tabs defaultValue="revenue">
        <TabsList>
          <TabsTrigger value="revenue" className="flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4" /> الإيرادات
          </TabsTrigger>
          <TabsTrigger value="contracts" className="flex items-center gap-1.5">
            <FileText className="w-4 h-4" /> العقود
          </TabsTrigger>
          <TabsTrigger value="maintenance" className="flex items-center gap-1.5">
            <Wrench className="w-4 h-4" /> الصيانة
          </TabsTrigger>
        </TabsList>

        {/* Revenue Report */}
        <TabsContent value="revenue" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-primary" /> تقرير الإيرادات
              </CardTitle>
              <div className="flex items-center gap-3 flex-wrap">
                <DateRangeFilter from={revFrom} to={revTo} onFromChange={setRevFrom} onToChange={setRevTo} />
                <Button size="sm" variant="outline" onClick={exportRevExcel}>
                  <Download className="w-4 h-4" /> Excel
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <StatCard title="إجمالي الإيرادات في الفترة" value={formatCurrency(revData?.total || 0)} icon={TrendingUp} variant="success" className="max-w-xs" />

              {revData?.chartData?.length > 0 && (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={revData.chartData} margin={{ top: 5, right: 5, left: 30, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="total" fill="hsl(var(--primary))" radius={[6,6,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}

              <Table>
                <TableHeader>
                  <TableRow><TableHead>كود اللوحة</TableHead><TableHead>العنوان</TableHead><TableHead>الإجمالي</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {(revData?.byStand || []).sort((a,b) => b.total - a.total).map(s => (
                    <TableRow key={s.code}>
                      <TableCell className="font-semibold">{s.code}</TableCell>
                      <TableCell className="text-muted-foreground text-xs max-w-[140px] truncate">{s.address?.slice(0,40)}</TableCell>
                      <TableCell className="font-medium text-success">{formatCurrency(s.total)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Contracts Report */}
        <TabsContent value="contracts" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary" /> تقرير العقود
              </CardTitle>
              <div className="flex items-center gap-3 flex-wrap">
                <DateRangeFilter from={ctFrom} to={ctTo} onFromChange={setCtFrom} onToChange={setCtTo} />
                <Button size="sm" variant="outline" onClick={exportCtExcel}>
                  <Download className="w-4 h-4" /> Excel
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                <StatCard title="عدد العقود" value={ctData?.total || 0} icon={FileText} variant="default" />
                <StatCard title="إجمالي القيمة" value={formatCurrency(ctData?.totalValue || 0)} icon={FileText} variant="info" />
                <StatCard title="المدفوع" value={formatCurrency(ctData?.totalPaid || 0)} icon={FileText} variant="success" />
                <StatCard title="مستحق الآن" value={formatCurrency(ctData?.periodDue || 0)} icon={FileText} variant={ctData?.periodDue > 0 ? 'danger' : 'success'} />
                <StatCard title="الباقي على العقود" value={formatCurrency(ctData?.totalOwed || 0)} icon={FileText} variant={ctData?.totalOwed > 0 ? 'warning' : 'success'} />
              </div>

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>اللوحة</TableHead><TableHead>العنوان</TableHead><TableHead>العميل</TableHead><TableHead>المدة</TableHead>
                      <TableHead>البداية</TableHead><TableHead>النهاية</TableHead><TableHead>القيمة</TableHead>
                      <TableHead>المدفوع</TableHead><TableHead>مستحق الآن</TableHead><TableHead>الحالة</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(ctData?.contracts || []).map(c => {
                      const paid = (c.payments||[]).reduce((a,p) => a+safeNum(p.amount),0)
                      const realStatus = computeContractStatus(c.start_date, c.end_date, c.status)
                      let periodDue = 0
                      if (realStatus === 'active' && c.start_date && c.payment_frequency) {
                        const INTERVAL_MONTHS = { monthly: 1, quarterly: 3, semi_annual: 6, annual: 12 }
                        const now = new Date()
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
                        periodDue = Math.max(0, periodsDue * periodRate - paid)
                      }
                      return (
                        <TableRow key={c.id} className="cursor-pointer" onClick={() => navigate(`/contracts/${c.id}`)}>
                          <TableCell className="font-semibold">{c.stands?.code}</TableCell>
                          <TableCell className="text-muted-foreground text-xs max-w-[140px] truncate">{c.stands?.address || '—'}</TableCell>
                          <TableCell>{c.clients?.name}</TableCell>
                          <TableCell className="text-sm">{c.duration_months ? `${c.duration_months} شهر` : '—'}</TableCell>
                          <TableCell>{formatDate(c.start_date)}</TableCell>
                          <TableCell>{formatDate(c.end_date)}</TableCell>
                          <TableCell>{formatCurrency(c.total_value)}</TableCell>
                          <TableCell className={paid >= safeNum(c.total_value) ? 'text-success font-medium' : 'text-muted-foreground'}>{formatCurrency(paid)}</TableCell>
                          <TableCell className={periodDue > 0 ? 'text-destructive font-medium' : 'text-muted-foreground'}>{formatCurrency(periodDue)}</TableCell>
                          <TableCell>
                            <span className={`text-xs font-medium px-2 py-1 rounded-full ${realStatus==='active'?'bg-success/15 text-success':realStatus==='expired'?'bg-destructive/15 text-destructive':realStatus==='terminated'?'bg-muted text-muted-foreground':'bg-primary/15 text-primary'}`}>
                              {statusLabels[realStatus] || realStatus}
                            </span>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Maintenance Report */}
        <TabsContent value="maintenance" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
              <CardTitle className="flex items-center gap-2">
                <Wrench className="w-5 h-5 text-primary" /> تقرير الصيانة
              </CardTitle>
              <div className="flex items-center gap-3 flex-wrap">
                <DateRangeFilter from={mntFrom} to={mntTo} onFromChange={setMntFrom} onToChange={setMntTo} />
                <Button size="sm" variant="outline" onClick={exportMntExcel}>
                  <Download className="w-4 h-4" /> Excel
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <StatCard title="إجمالي تكلفة الصيانة" value={formatCurrency(mntData?.total || 0)} icon={Wrench} variant="warning" />
                <StatCard title="مدفوع للفنيين" value={formatCurrency(mntData?.paid || 0)} icon={Wrench} variant="success" />
                <StatCard title="غير مدفوع" value={formatCurrency(mntData?.unpaid || 0)} icon={Wrench} variant="danger" />
              </div>

              {(mntData?.byStand || []).length > 0 && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>اللوحة</TableHead><TableHead>الإجمالي</TableHead>
                      <TableHead>المدفوع</TableHead><TableHead>غير المدفوع</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mntData.byStand.sort((a,b) => b.total - a.total).map(s => (
                      <TableRow key={s.code}>
                        <TableCell className="font-semibold">{s.code}</TableCell>
                        <TableCell className="font-medium">{formatCurrency(s.total)}</TableCell>
                        <TableCell className="text-success">{formatCurrency(s.paid)}</TableCell>
                        <TableCell className={s.unpaid > 0 ? 'text-destructive' : 'text-muted-foreground'}>{formatCurrency(s.unpaid)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
