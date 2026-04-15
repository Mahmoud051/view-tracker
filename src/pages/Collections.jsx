import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Download, Search, User, MapPin, Calendar, AlertCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatDate, formatCurrency, safeNum, computeContractStatus, cn, toArabicNumbers } from '@/lib/utils'
import { useToast } from '@/contexts/ToastContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PageHeader, LoadingScreen, EmptyState } from '@/components/ui/shared'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

const INTERVAL_MONTHS = { monthly: 1, quarterly: 3, semi_annual: 6, annual: 12 }
const ARABIC_MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
]

export default function Collections() {
  const [contracts, setContracts] = useState([])
  const [paymentsMap, setPaymentsMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const navigate = useNavigate()
  const { toast } = useToast()

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    setLoading(true)
    try {
      const [{ data: contractsData }, { data: paymentsData }] = await Promise.all([
        supabase
          .from('contracts')
          .select('*, stands(code, address), clients(name, phone)')
          .order('created_at', { ascending: false }),
        supabase.from('payments').select('contract_id, amount, payment_date')
      ])

      // Filter to only active, expired, or upcoming contracts (not terminated)
      const filtered = (contractsData || []).filter(c => 
        c.status !== 'terminated'
      )

      setContracts(filtered || [])
      
      // Group payments by contract
      const pm = {}
      ;(paymentsData || []).forEach(pay => {
        if (!pm[pay.contract_id]) pm[pay.contract_id] = []
        pm[pay.contract_id].push(pay)
      })
      setPaymentsMap(pm)
    } catch (e) {
      console.error('Error fetching collections:', e)
      toast({
        title: 'خطأ',
        description: 'فشل في تحميل بيانات التحصيل',
        variant: 'error'
      })
    }
    setLoading(false)
  }

  function calculateUnpaidMonths(contract) {
    const now = new Date()
    const start = new Date(contract.start_date)
    const end = contract.end_date ? new Date(contract.end_date) : null
    const paymentFreq = contract.payment_frequency || 'monthly'
    const intervalMonths = INTERVAL_MONTHS[paymentFreq] || 1
    const monthlyRate = safeNum(contract.monthly_rate)
    const periodRate = monthlyRate * intervalMonths

    // Get payments for this contract
    const contractPayments = paymentsMap[contract.id] || []
    const totalPaid = contractPayments.reduce((sum, p) => sum + safeNum(p.amount), 0)

    // Calculate how many periods have elapsed
    const endDate = end && now > end ? end : now
    const rawMonths = (endDate.getFullYear() - start.getFullYear()) * 12 + (endDate.getMonth() - start.getMonth())
    const completeMonths = endDate.getDate() >= start.getDate() ? rawMonths + 1 : rawMonths
    const totalPeriodsElapsed = Math.ceil(completeMonths / intervalMonths)

    // Calculate total periods in contract
    const totalContractPeriods = contract.is_open ? 
      totalPeriodsElapsed + 10 : // For open contracts, assume some buffer
      Math.ceil((parseInt(contract.duration_months) || 1) / intervalMonths)

    // Calculate periods that should have been paid
    const periodsDue = Math.min(totalPeriodsElapsed, totalContractPeriods)
    const totalExpected = periodsDue * periodRate
    const totalUnpaid = Math.max(0, totalExpected - totalPaid)
    const unpaidPeriods = Math.ceil(totalUnpaid / periodRate)

    // Calculate which specific months are unpaid
    const unpaidMonthDetails = []
    if (unpaidPeriods > 0) {
      // Find out how many periods have been paid
      const paidPeriods = Math.floor(totalPaid / periodRate)
      
      // Calculate unpaid periods starting from the first unpaid one
      for (let i = 0; i < unpaidPeriods; i++) {
        const periodIndex = paidPeriods + i
        const periodStartMonth = periodIndex * intervalMonths
        
        // Calculate the actual months
        const startMonth = new Date(start)
        startMonth.setMonth(startMonth.getMonth() + periodStartMonth)
        
        const monthNumbers = []
        const monthNames = []
        for (let j = 0; j < intervalMonths; j++) {
          const monthDate = new Date(startMonth)
          monthDate.setMonth(monthDate.getMonth() + j)
          monthNumbers.push(monthDate.getMonth() + 1) // 1-indexed
          monthNames.push(ARABIC_MONTHS[monthDate.getMonth()])
        }

        unpaidMonthDetails.push({
          periodIndex: periodIndex + 1,
          monthNumbers,
          monthNames,
          amount: periodRate
        })
      }
    }

    return {
      totalPaid,
      totalExpected,
      totalUnpaid,
      unpaidPeriods,
      unpaidMonthDetails,
      periodRate,
      monthlyRate,
      intervalMonths,
      paymentFreq
    }
  }

  // Group contracts by client
  const clientGroups = (contracts || []).reduce((groups, contract) => {
    const clientId = contract.client_id
    const clientName = contract.clients?.name || 'غير معروف'
    
    if (!groups[clientId]) {
      groups[clientId] = {
        id: clientId,
        name: clientName,
        phone: contract.clients?.phone || '',
        contracts: [],
        totalUnpaid: 0,
        totalUnpaidPeriods: 0
      }
    }

    const calc = calculateUnpaidMonths(contract)
    groups[clientId].contracts.push({ ...contract, ...calc })
    groups[clientId].totalUnpaid += calc.totalUnpaid
    groups[clientId].totalUnpaidPeriods += calc.unpaidPeriods

    return groups
  }, {})

  // Convert to array and filter by search
  const filteredClients = Object.values(clientGroups)
    .filter(client => {
      if (!search) return true
      const searchLower = search.toLowerCase()
      return (
        client.name.toLowerCase().includes(searchLower) ||
        client.phone.toLowerCase().includes(searchLower) ||
        client.contracts.some(c => 
          c.stands?.code?.toLowerCase().includes(searchLower) ||
          c.stands?.address?.toLowerCase().includes(searchLower)
        )
      )
    })
    .sort((a, b) => b.totalUnpaid - a.totalUnpaid) // Sort by highest unpaid first

  const totalAllUnpaid = filteredClients.reduce((sum, c) => sum + c.totalUnpaid, 0)

  const unpaidClients = filteredClients.filter(client => client.totalUnpaid > 0);

  async function exportToPDF() {
    const html = `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8"/>
  <title>تقرير التحصيل</title>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Cairo', Arial, sans-serif;
      direction: rtl;
      color: #1e293b;
      background: #fff;
    }
    @page {
      size: A4 portrait;
      margin: 10mm;
    }
    .page {
      padding: 0;
    }
    .header {
      text-align: center;
      border-bottom: 3px solid #1E3A5F;
      padding-bottom: 8px;
      margin-bottom: 12px;
    }
    .company {
      font-size: 22px;
      font-weight: 900;
      color: #1E3A5F;
    }
    .subtitle {
      font-size: 9px;
      color: #64748b;
      margin-top: 2px;
    }
    .client-section {
      margin-bottom: 8px;
      page-break-inside: avoid;
    }
    .client-header {
      background: linear-gradient(135deg, #1E3A5F 0%, #2c5282 100%);
      color: white;
      padding: 6px 8px;
      border-radius: 6px 6px 0 0;
    }
    .client-name {
      font-size: 13px;
      font-weight: 700;
      margin-bottom: 1px;
    }
    .client-phone {
      font-size: 9px;
      opacity: 0.9;
    }
    .client-total {
      background: #fef2f2;
      border: 1px solid #fee2e2;
      border-top: none;
      border-radius: 0 0 6px 6px;
      padding: 4px 8px;
      font-size: 10px;
      font-weight: 700;
      color: #dc2626;
      margin-bottom: 6px;
    }
    .contract-box {
      border: 2px solid #e2e8f0;
      border-radius: 6px;
      padding: 6px 8px;
      margin-bottom: 6px;
      page-break-inside: avoid;
      overflow: hidden;
    }
    .contract-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 5px;
    }
    .contract-code {
      font-size: 12px;
      font-weight: 700;
      color: #1E3A5F;
    }
    .contract-location {
      font-size: 8px;
      color: #64748b;
      margin-top: 1px;
    }
    .contract-details {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 4px;
      margin-bottom: 5px;
    }
    .detail-item {
      padding: 4px;
      background: #f8fafc;
      border-radius: 3px;
    }
    .detail-label {
      font-size: 7px;
      color: #64748b;
      margin-bottom: 1px;
    }
    .detail-value {
      font-size: 9px;
      font-weight: 600;
      color: #1e293b;
    }
    .detail-value.unpaid {
      color: #dc2626;
      font-size: 10px;
      font-weight: 700;
    }
    .unpaid-months {
      padding: 5px;
      background: #fef2f2;
      border-radius: 4px;
      border: 1px solid #fee2e2;
    }
    .months-title {
      font-size: 8px;
      font-weight: 700;
      color: #dc2626;
      margin-bottom: 4px;
    }
    .months-badges {
      display: flex;
      flex-wrap: wrap;
      gap: 2px;
      margin-bottom: 4px;
    }
    .month-badge {
      display: inline-block;
      padding: 2px 4px;
      background: white;
      border: 1px solid #fecaca;
      border-radius: 2px;
      font-size: 8px;
      font-weight: 600;
      color: #dc2626;
    }
    .summary-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-top: 4px;
      border-top: 1px solid #fecaca;
      font-size: 9px;
      font-weight: 600;
    }
    .footer {
      margin-top: 12px;
      padding-top: 6px;
      border-top: 2px solid #e2e8f0;
      text-align: center;
      font-size: 7px;
      color: #94a3b8;
    }
  </style>
</head>
<body>
  <div class="page">
    ${filteredClients.filter(client => client.totalUnpaid > 0).map(client => {
      const clientContracts = client.contracts.filter(c => c.unpaidPeriods > 0 && c.totalUnpaid > 0);
      return `
    <div class="client-section">
      <div class="client-header">
        <div class="client-name">${client.name}</div>
        <div class="client-phone">${client.phone || '—'}</div>
      </div>
      <div class="client-total">
        إجمالي غير المدفوع: ${formatCurrency(client.totalUnpaid)} (${toArabicNumbers(client.totalUnpaidPeriods)} فترة)
      </div>
      ${clientContracts.map(contract => `
      <div class="contract-box">
        <div class="contract-header">
          <div>
            <div class="contract-code">${contract.stands?.code || '—'}</div>
            <div class="contract-location">${contract.stands?.address || '—'}</div>
          </div>
        </div>
        <div class="contract-details">
          <div class="detail-item">
            <div class="detail-label">قيمة الفترة</div>
            <div class="detail-value">${formatCurrency(contract.periodRate)}</div>
          </div>
          <div class="detail-item">
            <div class="detail-label">المدفوع</div>
            <div class="detail-value" style="color: #22c55e;">${formatCurrency(contract.totalPaid)}</div>
          </div>
          <div class="detail-item">
            <div class="detail-label">المتوقع</div>
            <div class="detail-value">${formatCurrency(contract.totalExpected)}</div>
          </div>
          <div class="detail-item" style="background: #fef2f2;">
            <div class="detail-label" style="color: #dc2626;">فترات غير مدفوعة</div>
            <div class="detail-value unpaid">${toArabicNumbers(contract.unpaidPeriods)}</div>
          </div>
        </div>
        ${contract.unpaidMonthDetails.length > 0 ? `
        <div class="unpaid-months">
          <div class="months-title">الأشهر غير المدفوعة:</div>
          <div class="months-badges">
            ${contract.unpaidMonthDetails.flatMap(period => 
              period.monthNames.map((name, i) => 
                `<span class="month-badge">${name} (${toArabicNumbers(period.monthNumbers[i])})</span>`
              )
            ).join('')}
          </div>
          <div class="summary-row">
            <span>${toArabicNumbers(contract.unpaidMonthDetails.reduce((sum, p) => sum + p.monthNumbers.length, 0))} ${contract.unpaidMonthDetails.reduce((sum, p) => sum + p.monthNumbers.length, 0) === 1 ? 'شهر' : 'أشهر'} × ${formatCurrency(contract.monthlyRate)}</span>
            <span style="font-size: 10px; font-weight: 900; color: #dc2626;">= ${formatCurrency(contract.totalUnpaid)}</span>
          </div>
        </div>
        ` : ''}
      </div>
      `).join('')}
    </div>
    `;
    }).join('')}

    <div class="footer">
      ڤيو — نظام إدارة اللوحات الإعلانية © ${new Date().getFullYear()}
    </div>
  </div>
</body>
</html>`

    const win = window.open('', '_blank')
    win.document.write(html)
    win.document.close()

    setTimeout(() => {
      win.print()
    }, 1000)

    toast({
      title: 'تم فتح نافذة الطباعة',
      description: 'اختر "Save as PDF" من خيارات الطابعة لحفظ الملف',
      variant: 'success'
    })
  }

  if (loading) return <LoadingScreen />

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader 
        title="التحصيل" 
        description={`${toArabicNumbers(filteredClients.length)} عميل — إجمالي غير المدفوع: ${formatCurrency(totalAllUnpaid)}`}
      >
        <Button onClick={exportToPDF}>
          <Download className="w-4 h-4" /> تصدير PDF
        </Button>
      </PageHeader>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input 
          placeholder="ابحث بالعميل أو الهاتف أو اللوحة..." 
          value={search} 
          onChange={e => setSearch(e.target.value)} 
          className="ps-9" 
        />
      </div>

      {/* Client Cards */}
      {filteredClients.length === 0 ? (
        <EmptyState 
          icon={AlertCircle} 
          title="لا توجد عملاء" 
          description="لم يتم العثور على عملاء" 
        />
      ) : (
        <div className="space-y-6">
          {filteredClients.map(client => (
            <Card key={client.id} className="border-2">
              <CardContent className="p-0">
                {/* Client Header */}
                <div className="bg-gradient-to-r from-primary to-primary/80 text-primary-foreground p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <User className="w-5 h-5" />
                        <h3 className="text-xl font-bold">{client.name}</h3>
                      </div>
                      {client.phone && (
                        <p className="text-sm opacity-90" dir="ltr">{client.phone}</p>
                      )}
                    </div>
                    <Badge className="bg-destructive/30 text-destructive border-destructive text-sm px-3 py-1">
                      {formatCurrency(client.totalUnpaid)}
                    </Badge>
                  </div>
                </div>

                {/* Client Summary */}
                <div className="bg-destructive/5 border-b border-destructive/20 px-5 py-3">
                  <p className="text-sm font-semibold text-destructive">
                    إجمالي غير المدفوع: {formatCurrency(client.totalUnpaid)} 
                    {' '}(
                    {toArabicNumbers(client.totalUnpaidPeriods)} {client.totalUnpaidPeriods === 1 ? 'فترة' : 'فترات'})
                  </p>
                </div>

                {/* Contracts */}
                <div className="divide-y">
                  {client.contracts
                    .filter(c => c.unpaidPeriods > 0)
                    .map(contract => (
                      <div key={contract.id} className="p-5 hover:bg-muted/30 transition-colors">
                        {/* Contract Header */}
                        <div className="flex items-start justify-between gap-4 mb-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-lg font-bold text-foreground">{contract.stands?.code}</span>
                              <Badge 
                                variant="outline" 
                                className="text-xs"
                              >
                                {contract.intervalMonths === 1 ? 'شهري' : 
                                 contract.intervalMonths === 3 ? 'ربع سنوي' : 
                                 contract.intervalMonths === 6 ? 'نصف سنوي' : 'سنوي'}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-1 text-sm text-muted-foreground">
                              <MapPin className="w-3 h-3" />
                              <span className="truncate">{contract.stands?.address}</span>
                            </div>
                          </div>
                          <div className="text-start">
                            <p className="text-2xl font-bold text-destructive">
                              {formatCurrency(contract.totalUnpaid)}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              غير مدفوع
                            </p>
                          </div>
                        </div>

                        {/* Contract Details */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                          <div className="p-2 rounded-lg bg-muted/30">
                            <p className="text-xs text-muted-foreground">قيمة الفترة</p>
                            <p className="text-sm font-semibold mt-0.5">{formatCurrency(contract.periodRate)}</p>
                          </div>
                          <div className="p-2 rounded-lg bg-muted/30">
                            <p className="text-xs text-muted-foreground">المدفوع</p>
                            <p className="text-sm font-semibold mt-0.5 text-success">{formatCurrency(contract.totalPaid)}</p>
                          </div>
                          <div className="p-2 rounded-lg bg-muted/30">
                            <p className="text-xs text-muted-foreground">المتوقع</p>
                            <p className="text-sm font-semibold mt-0.5">{formatCurrency(contract.totalExpected)}</p>
                          </div>
                          <div className="p-2 rounded-lg bg-destructive/10">
                            <p className="text-xs text-destructive">فترات غير مدفوعة</p>
                            <p className="text-sm font-semibold mt-0.5 text-destructive">
                              {toArabicNumbers(contract.unpaidPeriods)}
                            </p>
                          </div>
                        </div>

                        {/* Unpaid Months - Badge-based with names & numbers */}
                        {contract.unpaidMonthDetails.length > 0 && (
                          <div className="mt-3 p-3 rounded-lg bg-destructive/5 border border-destructive/20">
                            <p className="text-xs font-semibold text-destructive mb-2">
                              الأشهر غير المدفوعة:
                            </p>
                            <div className="flex flex-wrap gap-2 mb-3">
                              {contract.unpaidMonthDetails.map((period, idx) => (
                                period.monthNames.map((name, i) => (
                                  <Badge key={`${idx}-${i}`} variant="outline" className="bg-destructive/10 border-destructive/30 text-destructive font-medium">
                                    {name} ({toArabicNumbers(period.monthNumbers[i])})
                                  </Badge>
                                ))
                              ))}
                            </div>
                            <div className="flex items-center justify-between pt-2 border-t border-destructive/10">
                              <p className="text-sm font-medium">
                                {toArabicNumbers(contract.unpaidMonthDetails.reduce((sum, p) => sum + p.monthNumbers.length, 0))} {contract.unpaidMonthDetails.reduce((sum, p) => sum + p.monthNumbers.length, 0) === 1 ? 'شهر' : 'أشهر'} × {formatCurrency(contract.monthlyRate)}
                              </p>
                              <p className="text-lg font-bold text-destructive">
                                = {formatCurrency(contract.totalUnpaid)}
                              </p>
                            </div>
                          </div>
                        )}

                        {/* View Contract Button */}
                        <div className="mt-4">
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => navigate(`/contracts/${contract.id}`)}
                          >
                            عرض العقد
                          </Button>
                        </div>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
