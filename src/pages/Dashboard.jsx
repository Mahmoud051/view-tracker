import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, Users, CheckCircle, AlertCircle, TrendingUp, Bell, FileText, PieChart as PieChartIcon, Wrench, CreditCard } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'
import { supabase } from '@/lib/supabase'
import { formatDate, formatCurrency, daysRemaining, getLast6MonthsLabels, safeNum, toLocalDateStr, computeContractStatus } from '@/lib/utils'
import { StatCard, LoadingScreen, PageHeader } from '@/components/ui/shared'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function Dashboard() {
  const [stats, setStats] = useState({ total: 0, rented: 0, available: 0, owed: 0, overpaid: 0, periodDue: 0, totalContracts: 0, totalRevenue: 0, paidMaintenance: 0, unpaidMaintenance: 0 })
  const [govAlerts, setGovAlerts] = useState([])
  const [contractAlerts, setContractAlerts] = useState([])
  const [chartData, setChartData] = useState([])
  const [standStatusData, setStandStatusData] = useState([])
  const [contractStatusData, setContractStatusData] = useState([])
  const [recentPayments, setRecentPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    fetchDashboardData()
  }, [])

  async function fetchDashboardData() {
    setLoading(true)
    try {
      const today = toLocalDateStr(new Date())
      const in30 = toLocalDateStr(new Date(Date.now() + 30 * 86400000))

      // Fetch all needed data in parallel
      const [
        { data: stands },
        { data: allContracts },
        { data: activeContracts },
        { data: allPayments },
        { data: maintenanceRecords },
      ] = await Promise.all([
        supabase.from('stands').select('id, code, address, gov_rental_end, gov_license_number, is_active'),
        supabase.from('contracts').select('id, stand_id, total_value, status, end_date, start_date, duration_months, payment_frequency, stands(code, address), clients(name)'),
        supabase.from('contracts').select('id, stand_id, total_value, status').eq('status', 'active'),
        supabase.from('payments').select('id, contract_id, amount, payment_date, contracts(stands(code))').order('payment_date', { ascending: false }),
        supabase.from('maintenance_records').select('id, cost, is_paid, date'),
      ])

      const total = (stands || []).length
      const inactiveStands = (stands || []).filter(s => s.is_active === false).length
      const activeStands = total - inactiveStands

      // Active contracts (use computed status, not just DB status)
      const rentedStandIds = new Set((allContracts || [])
        .filter(c => computeContractStatus(c.start_date, c.end_date, c.status) === 'active')
        .map(c => c.stand_id))
      const rented = rentedStandIds.size
      const available = activeStands - rented

      // Payments / owed
      const activeContractIds = (allContracts || [])
        .filter(c => computeContractStatus(c.start_date, c.end_date, c.status) === 'active')
        .map(c => c.id)
      let owed = 0
      let overpaid = 0
      let periodDue = 0
      if (activeContractIds.length > 0) {
        const paidMap = {}
        ;(allPayments || []).forEach(p => {
          paidMap[p.contract_id] = (paidMap[p.contract_id] || 0) + safeNum(p.amount)
        })
        owed = (activeContracts || []).reduce((acc, c) => {
          const paid = paidMap[c.id] || 0
          return acc + Math.max(0, safeNum(c.total_value) - paid)
        }, 0)
        overpaid = (activeContracts || []).reduce((acc, c) => {
          const paid = paidMap[c.id] || 0
          return acc + Math.max(0, paid - safeNum(c.total_value))
        }, 0)
        // What is due right now based on payment cycle (quarterly, monthly, etc.)
        // A period is considered due once its interval has fully passed.
        // e.g. quarterly from Sep 9: Sep 9-Dec 8 (period 1), Dec 9-Mar 8 (period 2), etc.
        const INTERVAL_MONTHS = { monthly: 1, quarterly: 3, semi_annual: 6, annual: 12 }
        const now = new Date()
        periodDue = ((allContracts || [])).filter(c => computeContractStatus(c.start_date, c.end_date, c.status) === 'active').reduce((acc, c) => {
          const paid = paidMap[c.id] || 0
          if (!c.start_date || !c.payment_frequency) return acc
          const start = new Date(c.start_date)
          const monthlyRate = safeNum(c.total_value) / (parseInt(c.duration_months) || 1)
          const intervalMonths = INTERVAL_MONTHS[c.payment_frequency] || 1
          const periodRate = monthlyRate * intervalMonths

          // Cap "now" at contract end date — can't owe for future portions beyond contract life
          const end = c.end_date ? new Date(c.end_date) : null
          const nowCapped = (end && now > end) ? end : now

          // How many complete months have elapsed since the contract start date?
          // Each time we cross a month boundary (1st of next month), that counts as a complete month.
          // Sep 9 → Oct 1 = 1, Oct 1 → Nov 1 = 2, ..., Mar 1 → Apr 1 = 7 complete months
          // We count: if today is on or after the start day-of-month, add 1 more month.
          const rawMonths = (nowCapped.getFullYear() - start.getFullYear()) * 12
            + (nowCapped.getMonth() - start.getMonth())
          const completeMonths = nowCapped.getDate() >= start.getDate() ? rawMonths + 1 : rawMonths

          // How many periods are due — use ceil so partially-elapsed periods count as due
          // e.g. 7 months quarterly → ceil(7/3) = 3 periods due (Sep-Nov, Dec-Feb, Mar-May)
          const totalPeriods = Math.ceil((parseInt(c.duration_months) || 1) / intervalMonths)
          const periodsDue = Math.min(Math.ceil(completeMonths / intervalMonths), totalPeriods)
          const amountDue = periodsDue * periodRate
          const overdue = Math.max(0, amountDue - paid)
          return acc + overdue
        }, 0)
      }

      // Total revenue = sum of all payments
      const totalRevenue = (allPayments || []).reduce((a, p) => a + safeNum(p.amount), 0)

      // Maintenance costs
      const paidMaintenance = (maintenanceRecords || [])
        .filter(r => r.is_paid)
        .reduce((a, r) => a + safeNum(r.cost), 0)
      const unpaidMaintenance = (maintenanceRecords || [])
        .filter(r => !r.is_paid)
        .reduce((a, r) => a + safeNum(r.cost), 0)

      setStats({
        total,
        rented,
        available,
        owed,
        overpaid,
        periodDue,
        totalContracts: allContracts?.length || 0,
        totalRevenue,
        paidMaintenance,
        unpaidMaintenance,
      })

      // Gov alerts
      const govExp = (stands || []).filter(s => {
        if (!s.gov_rental_end) return false
        return s.gov_rental_end >= today && s.gov_rental_end <= in30
      })
      setGovAlerts(govExp)

      // Contract alerts expiring soon
      const expContracts = (allContracts || []).filter(c => {
        if (computeContractStatus(c.start_date, c.end_date, c.status) !== 'active') return false
        if (!c.end_date) return false
        return c.end_date >= today && c.end_date <= in30
      })
      setContractAlerts(expContracts)

      // Stand status pie chart
      setStandStatusData([
        { name: 'مؤجرة', value: rented, color: 'hsl(var(--success))' },
        { name: 'متاحة', value: Math.max(0, available), color: 'hsl(var(--primary))' },
        ...(inactiveStands > 0 ? [{ name: 'متوقفة', value: inactiveStands, color: 'hsl(var(--muted-foreground))' }] : []),
      ])

      // Contract status pie chart
      const statusCounts = {}
      ;(allContracts || []).forEach(c => { statusCounts[c.status] = (statusCounts[c.status] || 0) + 1 })
      const statusColors = { active: 'hsl(142, 76%, 36%)', expired: 'hsl(0, 84%, 60%)', upcoming: 'hsl(213, 67%, 24%)', terminated: 'hsl(215, 16%, 47%)' }
      const statusLabels = { active: 'نشط', expired: 'منتهي', upcoming: 'قادم', terminated: 'مُنهى' }
      setContractStatusData(
        Object.entries(statusCounts).map(([k, v]) => ({
          name: statusLabels[k] || k,
          value: v,
          color: statusColors[k] || 'hsl(var(--muted-foreground))',
        }))
      )

      // Revenue chart last 6 months
      const months = getLast6MonthsLabels()
      const firstMonth = `${months[0].year}-${String(months[0].month).padStart(2, '0')}-01`
      const recentPayments = (allPayments || []).filter(p => p.payment_date >= firstMonth)
      const monthlyTotals = {}
      months.forEach(m => { monthlyTotals[`${m.year}-${String(m.month).padStart(2, '0')}`] = 0 })
      recentPayments.forEach(p => {
        const d = new Date(p.payment_date)
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        if (monthlyTotals[key] !== undefined) {
          monthlyTotals[key] += safeNum(p.amount)
        }
      })
      setChartData(months.map(m => ({
        name: m.label,
        total: monthlyTotals[`${m.year}-${String(m.month).padStart(2, '0')}`] || 0,
      })))

      // Recent payments
      setRecentPayments((allPayments || []).slice(0, 5))
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const chartTooltip = ({ active, payload, label }) => {
    if (active && payload?.length) {
      return (
        <div className="bg-card border border-border rounded-xl px-4 py-3 shadow-xl">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="text-lg font-bold text-foreground">{formatCurrency(payload[0].value)}</p>
        </div>
      )
    }
    return null
  }

  const pieTooltip = ({ active, payload }) => {
    if (active && payload?.length) {
      return (
        <div className="bg-card border border-border rounded-xl px-4 py-3 shadow-xl">
          <p className="text-sm font-medium text-muted-foreground">{payload[0].name}</p>
          <p className="text-lg font-bold text-foreground">{payload[0].value}</p>
        </div>
      )
    }
    return null
  }

  if (loading) return <LoadingScreen />

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="لوحة التحكم" description="نظرة عامة على أداء الشركة" />

      {/* Stats Row 1 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="إجمالي اللوحات" value={stats.total} icon={Building2} variant="default" />
        <StatCard title="لوحات مؤجرة" value={stats.rented} icon={CheckCircle} variant="success" />
        <StatCard title="لوحات متاحة" value={stats.available} icon={Building2} variant="info" />
        <StatCard title="إجمالي العقود" value={stats.totalContracts} icon={FileText} variant="default" />
      </div>

      {/* Stats Row 2 */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard title="إجمالي الإيرادات" value={formatCurrency(stats.totalRevenue)} icon={TrendingUp} variant="success" />
        <StatCard title="صافي الربح" value={formatCurrency(stats.totalRevenue - stats.paidMaintenance)} icon={TrendingUp} variant="default" />
        <StatCard title="مستحق الآن" value={formatCurrency(stats.periodDue)} icon={CreditCard} variant="danger" />
        <StatCard title="الباقي على العقود" value={formatCurrency(stats.owed)} icon={CreditCard} variant="info" />
        <StatCard title="صيانة غير مدفوعة" value={formatCurrency(stats.unpaidMaintenance)} icon={Wrench} variant="warning" />
      </div>

      {/* Alerts */}
      {(govAlerts.length > 0 || contractAlerts.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {govAlerts.length > 0 && (
            <Card className="border-warning/40 bg-warning/5">
              <CardHeader className="pb-3">
                <CardTitle className="text-warning flex items-center gap-2 text-base">
                  <Bell className="w-5 h-5" />
                  تراخيص حكومية تنتهي قريباً ({govAlerts.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {govAlerts.slice(0, 5).map(s => {
                  const days = daysRemaining(s.gov_rental_end)
                  return (
                    <button
                      key={s.id}
                      onClick={() => navigate(`/stands/${s.id}`)}
                      className="w-full flex items-center justify-between p-3 rounded-xl bg-background/60 hover:bg-background transition-colors border border-border/50 text-start"
                    >
                      <div>
                        <p className="font-semibold text-sm text-foreground">{s.code}</p>
                        <p className="text-xs text-muted-foreground truncate max-w-[180px]">{s.address}</p>
                      </div>
                      <div className="text-end flex-shrink-0">
                        <p className="text-xs font-medium text-warning">{days} يوم متبقي</p>
                        <p className="text-xs text-muted-foreground">{formatDate(s.gov_rental_end)}</p>
                      </div>
                    </button>
                  )
                })}
              </CardContent>
            </Card>
          )}

          {contractAlerts.length > 0 && (
            <Card className="border-destructive/40 bg-destructive/5">
              <CardHeader className="pb-3">
                <CardTitle className="text-destructive flex items-center gap-2 text-base">
                  <AlertCircle className="w-5 h-5" />
                  عقود تنتهي قريباً ({contractAlerts.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {contractAlerts.slice(0, 5).map(c => {
                  const days = daysRemaining(c.end_date)
                  return (
                    <button
                      key={c.id}
                      onClick={() => navigate(`/contracts/${c.id}`)}
                      className="w-full flex items-center justify-between p-3 rounded-xl bg-background/60 hover:bg-background transition-colors border border-border/50 text-start"
                    >
                      <div>
                        <p className="font-semibold text-sm text-foreground">{c.clients?.name}</p>
                        <p className="text-xs text-muted-foreground">{c.stands?.code} — {c.stands?.address?.slice(0, 30)}</p>
                      </div>
                      <div className="text-end flex-shrink-0">
                        <p className="text-xs font-medium text-destructive">{days} يوم متبقي</p>
                        <p className="text-xs text-muted-foreground">{formatDate(c.end_date)}</p>
                      </div>
                    </button>
                  )
                })}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Revenue bar chart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="w-5 h-5 text-primary" />
              الإيرادات — آخر 6 أشهر
            </CardTitle>
          </CardHeader>
          <CardContent>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                  <Tooltip content={chartTooltip} />
                  <Bar dataKey="total" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[260px] flex items-center justify-center text-muted-foreground text-sm">لا توجد بيانات</div>
            )}
          </CardContent>
        </Card>

        {/* Stand status pie */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <PieChartIcon className="w-5 h-5 text-primary" />
              حالة اللوحات
            </CardTitle>
          </CardHeader>
          <CardContent>
            {standStatusData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={standStatusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {standStatusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip content={pieTooltip} />
                  <Legend
                    formatter={(value) => <span className="text-xs text-muted-foreground">{value}</span>}
                    wrapperStyle={{ fontSize: '12px' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">لا توجد بيانات</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Second charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Contract status pie */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="w-5 h-5 text-primary" />
              حالة العقود
            </CardTitle>
          </CardHeader>
          <CardContent>
            {contractStatusData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={contractStatusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {contractStatusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip content={pieTooltip} />
                  <Legend
                    formatter={(value) => <span className="text-xs text-muted-foreground">{value}</span>}
                    wrapperStyle={{ fontSize: '12px' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">لا توجد بيانات</div>
            )}
          </CardContent>
        </Card>

        {/* Recent payments */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CreditCard className="w-5 h-5 text-primary" />
              آخر المدفوعات
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentPayments.length > 0 ? (
              <div className="space-y-3">
                {recentPayments.map(p => (
                  <div key={p.id} className="flex items-center justify-between p-3 rounded-xl bg-muted/40 border border-border/50">
                    <div>
                      <p className="text-sm font-medium text-foreground">{formatCurrency(p.amount)}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(p.payment_date)}</p>
                    </div>
                    <div className="text-end">
                      <p className="text-xs font-medium text-success">مدفوع</p>
                      <p className="text-xs text-muted-foreground">{p.contracts?.stands?.code || '—'}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-[160px] flex items-center justify-center text-muted-foreground text-sm">لا توجد مدفوعات</div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
