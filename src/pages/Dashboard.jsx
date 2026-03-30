import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, Users, CheckCircle, AlertCircle, TrendingUp, Bell, FileText } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { supabase } from '@/lib/supabase'
import { formatDate, formatCurrency, daysRemaining, getLast6MonthsLabels } from '@/lib/utils'
import { StatCard, LoadingScreen, PageHeader, StatusBadge } from '@/components/ui/shared'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function Dashboard() {
  const [stats, setStats] = useState({ total: 0, rented: 0, available: 0, unpaid: 0 })
  const [govAlerts, setGovAlerts] = useState([])
  const [contractAlerts, setContractAlerts] = useState([])
  const [chartData, setChartData] = useState([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    fetchDashboardData()
  }, [])

  async function fetchDashboardData() {
    setLoading(true)
    try {
      const today = new Date().toISOString().split('T')[0]
      const in30 = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]

      // Stands
      const { data: stands } = await supabase.from('stands').select('id, code, address, gov_rental_end, gov_license_number')
      const total = stands?.length || 0

      // Active contracts
      const { data: activeContracts } = await supabase
        .from('contracts')
        .select('id, stand_id, total_value, status, end_date, start_date')
        .eq('status', 'active')

      const rentedStandIds = new Set((activeContracts || []).map(c => c.stand_id))
      const rented = rentedStandIds.size
      const available = total - rented

      // Payments
      const activeContractIds = (activeContracts || []).map(c => c.id)
      let unpaid = 0
      if (activeContractIds.length > 0) {
        const { data: payments } = await supabase
          .from('payments')
          .select('contract_id, amount')
          .in('contract_id', activeContractIds)
        const paidMap = {}
        ;(payments || []).forEach(p => {
          paidMap[p.contract_id] = (paidMap[p.contract_id] || 0) + parseFloat(p.amount || 0)
        })
        unpaid = (activeContracts || []).reduce((acc, c) => {
          const paid = paidMap[c.id] || 0
          return acc + Math.max(0, parseFloat(c.total_value || 0) - paid)
        }, 0)
      }

      setStats({ total, rented, available, unpaid })

      // Gov alerts
      const govExp = (stands || []).filter(s => {
        if (!s.gov_rental_end) return false
        return s.gov_rental_end >= today && s.gov_rental_end <= in30
      })
      setGovAlerts(govExp)

      // Contract alerts expiring soon
      const { data: expContracts } = await supabase
        .from('contracts')
        .select('id, end_date, start_date, total_value, status, stands(code, address), clients(name, phone)')
        .eq('status', 'active')
        .gte('end_date', today)
        .lte('end_date', in30)
      setContractAlerts(expContracts || [])

      // Revenue chart last 6 months
      const months = getLast6MonthsLabels()
      const firstMonth = `${months[0].year}-${String(months[0].month).padStart(2, '0')}-01`
      const { data: payments } = await supabase
        .from('payments')
        .select('amount, payment_date')
        .gte('payment_date', firstMonth)
      
      const monthlyTotals = {}
      months.forEach(m => { monthlyTotals[`${m.year}-${m.month}`] = 0 })
      ;(payments || []).forEach(p => {
        const d = new Date(p.payment_date)
        const key = `${d.getFullYear()}-${d.getMonth() + 1}`
        if (monthlyTotals[key] !== undefined) {
          monthlyTotals[key] += parseFloat(p.amount || 0)
        }
      })
      setChartData(months.map(m => ({
        name: m.label,
        total: monthlyTotals[`${m.year}-${m.month}`] || 0,
      })))
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-card border border-border rounded-xl px-4 py-3 shadow-xl">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="text-lg font-bold text-foreground">{formatCurrency(payload[0].value)}</p>
        </div>
      )
    }
    return null
  }

  if (loading) return <LoadingScreen />

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="لوحة التحكم" description="نظرة عامة على أداء الشركة" />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="إجمالي اللوحات" value={stats.total} icon={Building2} variant="default" />
        <StatCard title="لوحات مؤجرة" value={stats.rented} icon={CheckCircle} variant="success" />
        <StatCard title="لوحات متاحة" value={stats.available} icon={Building2} variant="info" />
        <StatCard
          title="مبالغ مستحقة"
          value={formatCurrency(stats.unpaid)}
          icon={TrendingUp}
          variant="warning"
          description="إجمالي العقود النشطة غير المسددة"
        />
      </div>

      {/* Alerts */}
      {(govAlerts.length > 0 || contractAlerts.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Gov permits expiring */}
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

          {/* Contracts expiring */}
          {contractAlerts.length > 0 && (
            <Card className="border-destructive/40 bg-destructive/5">
              <CardHeader className="pb-3">
                <CardTitle className="text-destructive flex items-center gap-2 text-base">
                  <AlertCircle className="w-5 h-5" />
                  عقود عملاء تنتهي قريباً ({contractAlerts.length})
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

      {/* Revenue Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            الإيرادات — آخر 6 أشهر
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={v => `${(v / 1000).toFixed(0)}k`}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="total" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  )
}
