import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Download, BarChart3, FileText, Wrench, TrendingUp, Building2 } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { supabase } from '@/lib/supabase'
import { exportExcelFile, formatDate, formatCurrency, safeNum, getLast6MonthsLabels, statusLabels, toLocalDateStr, computeContractStatus, calculateGovRentForPeriod } from '@/lib/utils'
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

  // Government rent report
  const [govFrom, setGovFrom] = useState(defaultFrom)
  const [govTo, setGovTo] = useState(defaultTo)
  const [govData, setGovData] = useState(null)

  useEffect(() => { fetchAll() }, [])
  useEffect(() => { fetchRevenue() }, [revFrom, revTo])
  useEffect(() => { fetchContracts() }, [ctFrom, ctTo])
  useEffect(() => { fetchMaintenance() }, [mntFrom, mntTo])
  useEffect(() => { fetchGovernmentRent() }, [govFrom, govTo])

  async function fetchAll() {
    setLoading(true)
    await Promise.all([fetchRevenue(), fetchContracts(), fetchMaintenance(), fetchGovernmentRent()])
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

    // totalValue: handle open contracts by calculating elapsed period value
    const INTERVAL_FOR_TOTAL = { monthly: 1, quarterly: 3, semi_annual: 6, annual: 12 }
    const nowForTotal = new Date()
    const totalValue = contractsList.reduce((a, c) => {
      if (c.is_open) {
        if (!c.start_date || !c.monthly_rate) {
          const paid = (c.payments || []).reduce((b, p) => b + safeNum(p.amount), 0)
          return a + paid
        }
        const start = new Date(c.start_date)
        const end = c.end_date ? new Date(c.end_date) : null
        const nowCapped = end && nowForTotal > end ? end : nowForTotal
        const intervalMonths = INTERVAL_FOR_TOTAL[c.payment_frequency || 'monthly'] || 1
        const periodRate = safeNum(c.monthly_rate) * intervalMonths
        const rawMonths = (nowCapped.getFullYear() - start.getFullYear()) * 12 + (nowCapped.getMonth() - start.getMonth())
        const completeMonths = nowCapped.getDate() >= start.getDate() ? rawMonths + 1 : rawMonths
        const periodsDue = Math.ceil(completeMonths / intervalMonths)
        return a + (periodsDue * periodRate)
      }
      return a + safeNum(c.total_value)
    }, 0)
    const totalPaid = contractsList.reduce((a, c) =>
      a + (c.payments || []).reduce((b, p) => b + safeNum(p.amount), 0), 0)
    const totalOwed = Math.max(0, totalValue - totalPaid)

    // Period-based amount due across ALL contracts (not just active)
    const INTERVAL_MONTHS = { monthly: 1, quarterly: 3, semi_annual: 6, annual: 12 }
    const now = new Date()
    const periodDue = contractsList.reduce((acc, c) => {
      if (!c.start_date) return acc
      const realStatus = computeContractStatus(c.start_date, c.end_date, c.status)
      if (realStatus === 'upcoming') return acc
      // Default to monthly if payment_frequency is not set
      const paymentFreq = c.payment_frequency || 'monthly'
      const start = new Date(c.start_date)
      // Cap at end_date for terminated/expired contracts
      const end = c.end_date ? new Date(c.end_date) : null
      const nowCapped = end && now > end ? end : now
      // For open contracts, prefer monthly_rate; otherwise calculate from total_value
      const monthlyRate = (c.is_open && c.monthly_rate) ? safeNum(c.monthly_rate) : (safeNum(c.total_value) / (parseInt(c.duration_months) || 1))
      const intervalMonths = INTERVAL_MONTHS[paymentFreq] || 1
      const periodRate = monthlyRate * intervalMonths
      const paid = (c.payments || []).reduce((b, p) => b + safeNum(p.amount), 0)
      const rawMonths = (nowCapped.getFullYear() - start.getFullYear()) * 12 + (nowCapped.getMonth() - start.getMonth())
      const completeMonths = nowCapped.getDate() >= start.getDate() ? rawMonths + 1 : rawMonths

      let periodsDue
      if (c.is_open) {
        periodsDue = Math.ceil(completeMonths / intervalMonths)
      } else {
        const totalPeriods = Math.ceil((parseInt(c.duration_months) || 1) / intervalMonths)
        periodsDue = Math.min(Math.ceil(completeMonths / intervalMonths), totalPeriods)
      }
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

  async function fetchGovernmentRent() {
    const { data: history } = await supabase
      .from('gov_rental_history')
      .select('*, stands(code, address)')
      .order('start_date', { ascending: false })

    const historyList = history || []
    
    // Calculate total for the selected period
    const total = calculateGovRentForPeriod(historyList, govFrom, govTo)

    // By stand
    const byStand = {}
    historyList.forEach(h => {
      const code = h.stands?.code || 'غير محدد'
      const addr = h.stands?.address || ''
      if (!byStand[code]) {
        byStand[code] = { code, address: addr, history: [], total: 0 }
      }
      byStand[code].history.push(h)
    })

    // Calculate per-stand totals for the period
    Object.keys(byStand).forEach(code => {
      byStand[code].total = calculateGovRentForPeriod(byStand[code].history, govFrom, govTo)
    })

    // Monthly breakdown
    const monthMap = {}
    historyList.forEach(h => {
      const start = new Date(h.start_date)
      const end = h.end_date ? new Date(h.end_date) : new Date(govTo)
      const monthlyAmount = safeNum(h.monthly_amount)
      const dailyAmount = monthlyAmount / 30

      // Iterate through each day in the period and check if it overlaps with [govFrom, govTo]
      const from = new Date(govFrom)
      const to = new Date(govTo)
      const overlapStart = from > start ? from : start
      const overlapEnd = to < end ? to : end

      if (overlapStart <= overlapEnd) {
        let currentDate = new Date(overlapStart)
        while (currentDate <= overlapEnd) {
          const key = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`
          monthMap[key] = (monthMap[key] || 0) + dailyAmount
          currentDate.setDate(currentDate.getDate() + 1)
        }
      }
    })
    const chartData = Object.entries(monthMap).sort().map(([k, v]) => ({ name: k, total: Math.round(v) }))

    setGovData({ total, byStand: Object.values(byStand), chartData, history: historyList })
  }

  async function exportRevExcel() {
    const summary = [['إجمالي الإيرادات', revData.total], ['الفترة من', revFrom], ['إلى', revTo]]
    const byStandRows = revData.byStand.map(s => ({ 'كود اللوحة': s.code, 'العنوان': s.address, 'الإجمالي (جنيه)': s.total }))
    await exportExcelFile('تقرير_الإيرادات.xlsx', [
      { name: 'ملخص', type: 'aoa', rows: summary },
      { name: 'تفاصيل اللوحات', rows: byStandRows },
    ])
  }

  async function exportCtExcel() {
    const rows = (ctData?.contracts || []).map(c => {
      const paid = (c.payments || []).reduce((a, p) => a + safeNum(p.amount), 0)

      // Calculate contract total value (handle open contracts)
      let contractTotalValue
      if (c.is_open) {
        if (!c.start_date || !c.monthly_rate) {
          contractTotalValue = paid
        } else {
          const start = new Date(c.start_date)
          const end = c.end_date ? new Date(c.end_date) : null
          const nowCapped = end && new Date() > end ? end : new Date()
          const intervalMonths = ({ monthly: 1, quarterly: 3, semi_annual: 6, annual: 12 })[c.payment_frequency || 'monthly'] || 1
          const periodRate = safeNum(c.monthly_rate) * intervalMonths
          const rawMonths = (nowCapped.getFullYear() - start.getFullYear()) * 12 + (nowCapped.getMonth() - start.getMonth())
          const completeMonths = nowCapped.getDate() >= start.getDate() ? rawMonths + 1 : rawMonths
          const periodsDue = Math.ceil(completeMonths / intervalMonths)
          contractTotalValue = periodsDue * periodRate
        }
      } else {
        contractTotalValue = safeNum(c.total_value)
      }

      let periodDue = 0
      const realStatus = computeContractStatus(c.start_date, c.end_date, c.status)
      if (c.start_date && realStatus !== 'upcoming') {
        const INTERVAL_MONTHS = { monthly: 1, quarterly: 3, semi_annual: 6, annual: 12 }
        const now = new Date()
        const start = new Date(c.start_date)
        const paymentFreq = c.payment_frequency || 'monthly'
        const end = c.end_date ? new Date(c.end_date) : null
        const nowCapped = end && now > end ? end : now
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
        periodDue = Math.max(0, periodsDue * periodRate - paid)
      }
      return {
        'كود اللوحة': c.stands?.code,
        'العميل': c.clients?.name,
        'مدة العقد (شهر)': c.duration_months || '—',
        'البداية': formatDate(c.start_date),
        'النهاية': formatDate(c.end_date),
        'القيمة (جنيه)': c.is_open ? '—' : safeNum(c.total_value),
        'المدفوع (جنيه)': paid,
        'مستحق الآن (جنيه)': periodDue,
        'الباقي على العقد (جنيه)': Math.max(0, contractTotalValue - paid),
        'الحالة': statusLabels[c.status] || c.status,
      }
    })
    await exportExcelFile('تقرير_العقود.xlsx', [
      { name: 'العقود', rows },
    ])
  }

  async function exportMntExcel() {
    const rows = (mntData?.records || []).map(r => ({
      'كود اللوحة': r.stands?.code,
      'التاريخ': formatDate(r.date),
      'الوصف': r.description,
      'الفني': r.technician_name || '—',
      'التكلفة (جنيه)': safeNum(r.cost),
      'مدفوع': r.is_paid ? 'نعم' : 'لا',
    }))
    await exportExcelFile('تقرير_الصيانة.xlsx', [
      { name: 'الصيانة', rows },
    ])
  }

  async function exportGovRentExcel() {
    const summary = [['إجمالي الإيجار الحكومي', govData.total], ['الفترة من', govFrom], ['إلى', govTo]]
    const byStandRows = govData.byStand.map(s => ({ 'كود اللوحة': s.code, 'العنوان': s.address, 'الإجمالي (جنيه)': s.total }))
    await exportExcelFile('تقرير_الإيجار_الحكومي.xlsx', [
      { name: 'ملخص', type: 'aoa', rows: summary },
      { name: 'تفاصيل اللوحات', rows: byStandRows },
    ])
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
          <TabsTrigger value="govRent" className="flex items-center gap-1.5">
            <Building2 className="w-4 h-4" /> الإيجار الحكومي
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
                      <TableHead>البداية</TableHead><TableHead>النهاية</TableHead><TableHead>القيمة الإجمالية</TableHead>
                      <TableHead>المدفوع</TableHead><TableHead>مستحق الآن</TableHead><TableHead>الحالة</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(ctData?.contracts || []).map(c => {
                      const paid = (c.payments||[]).reduce((a,p) => a+safeNum(p.amount),0)
                      const realStatus = computeContractStatus(c.start_date, c.end_date, c.status)

                      // Calculate contract total value (handle open contracts)
                      let contractTotalValue
                      if (c.is_open) {
                        if (!c.start_date || !c.monthly_rate) {
                          contractTotalValue = paid
                        } else {
                          const start = new Date(c.start_date)
                          const end = c.end_date ? new Date(c.end_date) : null
                          const nowCapped = end && new Date() > end ? end : new Date()
                          const intervalMonths = ({ monthly: 1, quarterly: 3, semi_annual: 6, annual: 12 })[c.payment_frequency || 'monthly'] || 1
                          const periodRate = safeNum(c.monthly_rate) * intervalMonths
                          const rawMonths = (nowCapped.getFullYear() - start.getFullYear()) * 12 + (nowCapped.getMonth() - start.getMonth())
                          const completeMonths = nowCapped.getDate() >= start.getDate() ? rawMonths + 1 : rawMonths
                          const periodsDue = Math.ceil(completeMonths / intervalMonths)
                          contractTotalValue = periodsDue * periodRate
                        }
                      } else {
                        contractTotalValue = safeNum(c.total_value)
                      }

                      let periodDue = 0
                      if (c.start_date && realStatus !== 'upcoming') {
                        const INTERVAL_MONTHS = { monthly: 1, quarterly: 3, semi_annual: 6, annual: 12 }
                        const now = new Date()
                        const start = new Date(c.start_date)
                        const paymentFreq = c.payment_frequency || 'monthly'
                        const end = c.end_date ? new Date(c.end_date) : null
                        const nowCapped = end && now > end ? end : now
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
                          <TableCell>{c.is_open ? '—' : formatCurrency(c.total_value)}</TableCell>
                          <TableCell className={paid >= contractTotalValue ? 'text-success font-medium' : 'text-muted-foreground'}>{formatCurrency(paid)}</TableCell>
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

        {/* Government Rent Report */}
        <TabsContent value="govRent" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
              <CardTitle className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-primary" /> تقرير الإيجار الحكومي
              </CardTitle>
              <div className="flex items-center gap-3 flex-wrap">
                <DateRangeFilter from={govFrom} to={govTo} onFromChange={setGovFrom} onToChange={setGovTo} />
                <Button size="sm" variant="outline" onClick={exportGovRentExcel}>
                  <Download className="w-4 h-4" /> Excel
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <StatCard title="إجمالي الإيجار في الفترة" value={formatCurrency(govData?.total || 0)} icon={Building2} variant="warning" />
                <StatCard title="عدد اللوحات" value={govData?.byStand?.length || 0} icon={Building2} variant="info" />
                <StatCard title="متوسط الإيجار اليومي" value={formatCurrency((govData?.total || 0) / 30)} icon={Building2} variant="default" />
              </div>

              {govData?.chartData?.length > 0 && (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={govData.chartData} margin={{ top: 5, right: 5, left: 30, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="total" fill="hsl(var(--warning))" radius={[6,6,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}

              <Table>
                <TableHeader>
                  <TableRow><TableHead>كود اللوحة</TableHead><TableHead>العنوان</TableHead><TableHead>الإجمالي في الفترة</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {(govData?.byStand || []).sort((a,b) => b.total - a.total).map(s => (
                    <TableRow key={s.code}>
                      <TableCell className="font-semibold">{s.code}</TableCell>
                      <TableCell className="text-muted-foreground text-xs max-w-[140px] truncate">{s.address?.slice(0,40)}</TableCell>
                      <TableCell className="font-medium text-warning">{formatCurrency(s.total)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
