import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileDown, Building2, MapPin, Eye, EyeOff, Download } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatCurrency, safeNum, cn, computeContractStatus, toArabicNumbers } from '@/lib/utils'
import { useToast } from '@/contexts/ToastContext'
import { Button } from '@/components/ui/button'
import { PageHeader, LoadingScreen } from '@/components/ui/shared'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

// Helper function to check if text contains Arabic characters
const hasArabic = (text) => /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text)

export default function StandsExport() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [stands, setStands] = useState([])
  const [loading, setLoading] = useState(true)
  const [showPrice, setShowPrice] = useState(true)
  const [contractsMap, setContractsMap] = useState({})

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      const [standsRes, contractsRes] = await Promise.all([
        supabase.from('stands').select('*').order('code'),
        supabase.from('contracts').select('id, stand_id, status, start_date, end_date, is_open, clients(name)').eq('status', 'active')
      ])

      if (standsRes.error) throw standsRes.error
      if (contractsRes.error) throw contractsRes.error

      setStands(standsRes.data || [])
      
      // Map stands to their active contracts
      const cMap = {}
      contractsRes.data?.forEach(c => {
        cMap[c.stand_id] = c
      })
      setContractsMap(cMap)
    } catch (error) {
      console.error('Error fetching stands:', error)
      toast({
        title: 'خطأ',
        description: 'فشل في تحميل اللوحات',
        variant: 'error'
      })
    } finally {
      setLoading(false)
    }
  }

  const getStandStatus = (stand) => {
    const contract = contractsMap[stand.id]
    if (!contract) {
      return { status: 'available', label: 'Available', color: '#10b981', labelAr: 'متاح' } // green
    }

    const contractStatus = computeContractStatus(contract.start_date, contract.end_date, contract.status)
    if (contract.is_open) {
      return { status: 'rented_open', label: 'Rented - Open Contract', color: '#f59e0b', labelAr: 'مؤجر - عقد مفتوح' } // amber
    }
    
    if (contractStatus === 'expired') {
      return { status: 'available', label: 'Available', color: '#10b981', labelAr: 'متاح' }
    }

    const endDate = contract.end_date ? new Date(contract.end_date) : null
    const daysRemaining = endDate ? Math.ceil((endDate - new Date()) / (1000 * 60 * 60 * 24)) : null
    
    return {
      status: 'rented_closed',
      label: daysRemaining !== null ? `Rented - ${daysRemaining} days left` : 'Rented - Open End',
      color: '#ef4444', // red
      labelAr: daysRemaining !== null ? `مؤجر - ${toArabicNumbers(daysRemaining)} يوم متبقي` : 'مؤجر - عقد مغلق'
    }
  }

  const exportPDF = async (includePrice = true) => {
    // Filter stands based on price inclusion
    const filteredStands = includePrice ? stands : stands

    // Preload all images to ensure they're loaded before printing
    const imageLoadPromises = filteredStands
      .filter(stand => stand.photo_url)
      .map(stand => {
        return new Promise((resolve) => {
          const img = new Image()
          img.onload = () => resolve(true)
          img.onerror = () => resolve(false)
          img.src = stand.photo_url
        })
      })

    // Wait for all images to load (with 10 second timeout)
    const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve(false), 10000))
    await Promise.race([Promise.all(imageLoadPromises), timeoutPromise])

    // Build HTML for print
    const html = `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8"/>
  <title>${includePrice ? 'نظرة عامة على اللوحات' : 'اللوحات المتاحة للإيجار'}</title>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: 'Cairo', Arial, sans-serif; 
      direction: rtl; 
      color: #1e293b; 
      background: #fff; 
      padding: 40px; 
    }
    .header { 
      text-align: center; 
      border-bottom: 3px solid #1E3A5F; 
      padding-bottom: 20px; 
      margin-bottom: 30px; 
    }
    .company { 
      font-size: 36px; 
      font-weight: 900; 
      color: #1E3A5F; 
      letter-spacing: -1px; 
    }
    .subtitle { 
      font-size: 14px; 
      color: #64748b; 
      margin-top: 4px; 
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 16px;
    }
    .card {
      border: 2px solid #e2e8f0;
      border-radius: 8px;
      overflow: hidden;
      page-break-inside: avoid;
    }
    .card.available {
      border-color: #10b981;
      background: #f0fdf4;
    }
    .card.rented {
      border-color: #ef4444;
      background: #fef2f2;
    }
    .card-image {
      width: 100%;
      height: 500px;
      object-fit: cover;
      background: #e2e8f0;
    }
    .card-content {
      padding: 12px;
    }
    .card-code {
      font-size: 16px;
      font-weight: 700;
      color: #1e293b;
      margin-bottom: 6px;
    }
    .card-dimensions {
      font-size: 12px;
      color: #64748b;
      margin-bottom: 4px;
    }
    .card-address {
      font-size: 11px;
      color: #475569;
      margin-bottom: 6px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .card-status {
      font-size: 13px;
      font-weight: 700;
      padding: 4px 8px;
      border-radius: 999px;
      display: inline-block;
    }
    .card-status.available {
      background: #dcfce7;
      color: #16a34a;
    }
    .card-status.rented {
      background: #fee2e2;
      color: #dc2626;
    }
    .card-price {
      margin-top: 8px;
      font-size: 14px;
      font-weight: 700;
      color: #16a34a;
    }
    .footer { 
      margin-top: 40px; 
      padding-top: 20px; 
      border-top: 1px solid #e2e8f0; 
      text-align: center; 
      font-size: 12px; 
      color: #94a3b8; 
    }
    @media print {
      .grid { grid-template-columns: repeat(2, 1fr); }
      .card { page-break-inside: avoid; }
    }
    @page {
      size: portrait;
      margin: 20mm;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="company">ڤيو</div>
    <div class="subtitle">${includePrice ? 'نظرة عامة على اللوحات' : 'اللوحات المتاحة للإيجار'}</div>
    <div style="font-size:13px;color:#64748b;margin-top:6px;">الإجمالي: ${toArabicNumbers(filteredStands.length)} لوحة</div>
    <div style="font-size:12px;color:#94a3b8;">تاريخ التصدير: ${new Date().toLocaleDateString('ar-EG')}</div>
  </div>

  <div class="grid">
    ${filteredStands.map(stand => {
      const statusInfo = getStandStatus(stand)
      const isRented = statusInfo.status !== 'available'
      return `
    <div class="card ${isRented ? 'rented' : 'available'}">
      ${stand.photo_url ? `<img src="${stand.photo_url}" class="card-image" alt="${stand.code}" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22400%22 height=%22500%22><rect fill=%22%23e2e8f0%22 width=%22400%22 height=%22500%22/><text x=%2250%25%22 y=%2250%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 font-family=%22Cairo,Arial%22 font-size=%2224%22 fill=%22%2394a3b8%22>لا توجد صورة</text></svg>'"/>` : `<div class="card-image" style="display:flex;align-items:center;justify-content:center;background:#e2e8f0;"><svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="%2394a3b8" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></div>`}
      <div class="card-content">
        <div class="card-code">${stand.code || '—'}</div>
        ${stand.width && stand.height ? `<div class="card-dimensions">${toArabicNumbers(stand.width)}م × ${toArabicNumbers(stand.height)}م</div>` : ''}
        ${stand.address ? `<div class="card-address">${stand.address}</div>` : ''}
        <div class="card-status ${isRented ? 'rented' : 'available'}">${statusInfo.labelAr}</div>
        ${includePrice && stand.export_price ? `<div class="card-price">${toArabicNumbers(Number(stand.export_price).toLocaleString())} جنيه</div>` : ''}
      </div>
    </div>`
    }).join('')}
  </div>

  <div class="footer">
    ڤيو — نظام إدارة اللوحات الإعلانية © ${new Date().getFullYear()}
  </div>
</body>
</html>`

    const win = window.open('', '_blank')
    win.document.write(html)
    win.document.close()
    
    // Wait a bit for images to render in the new window before triggering print
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
        title="تصدير اللوحات"
        description={`${toArabicNumbers(stands.length)} لوحة إجمالاً`}
      >
        <Button
          variant="outline"
          onClick={() => exportPDF(true)}
          className="gap-2"
        >
          <Eye className="w-4 h-4" />
          تصدير للعملاء (مع السعر)
        </Button>
        <Button
          onClick={() => exportPDF(false)}
          className="gap-2"
        >
          <FileDown className="w-4 h-4" />
          تصدير داخلي (بدون سعر)
        </Button>
      </PageHeader>

      {/* Export Options Card */}
      <Card className="border-primary/20">
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <FileDown className="w-6 h-6 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-foreground mb-2">خيارات التصدير</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-lg bg-muted/50 border border-border">
                  <div className="flex items-center gap-2 mb-2">
                    <EyeOff className="w-5 h-5 text-muted-foreground" />
                    <h4 className="font-medium text-foreground">تصدير داخلي</h4>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    يعرض اللوحات المتاحة والمؤجرة بدون الأسعار - للاستخدام الداخلي
                  </p>
                </div>
                <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
                  <div className="flex items-center gap-2 mb-2">
                    <Eye className="w-5 h-5 text-primary" />
                    <h4 className="font-medium text-foreground">تصدير للعملاء</h4>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    يعرض جميع التفاصيل بما في ذلك الأسعار - مناسب للعرض على العملاء
                  </p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Preview Table */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">معاينة اللوحات</h3>
            <div className="flex items-center gap-2">
              <Button
                variant={showPrice ? 'default' : 'outline'}
                size="sm"
                onClick={() => setShowPrice(true)}
              >
                <Eye className="w-4 h-4 me-1" />
                مع السعر
              </Button>
              <Button
                variant={!showPrice ? 'default' : 'outline'}
                size="sm"
                onClick={() => setShowPrice(false)}
              >
                <EyeOff className="w-4 h-4 me-1" />
                بدون سعر
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {stands.map(stand => {
              const statusInfo = getStandStatus(stand)
              const isRented = statusInfo.status !== 'available'

              return (
                <Card 
                  key={stand.id} 
                  className={cn(
                    'border-2 transition-all',
                    isRented 
                      ? 'border-destructive/30 bg-destructive/5' 
                      : 'border-success/30 bg-success/5'
                  )}
                >
                  <CardContent className="p-4">
                    {/* Status indicator */}
                    <div className="flex items-center justify-between mb-3">
                      <Badge 
                        className="text-xs"
                        style={{ 
                          backgroundColor: statusInfo.color + '20',
                          color: statusInfo.color,
                          borderColor: statusInfo.color
                        }}
                      >
                        {statusInfo.labelAr}
                      </Badge>
                      {isRented ? (
                        <EyeOff className="w-4 h-4 text-destructive" />
                      ) : (
                        <Eye className="w-4 h-4 text-success" />
                      )}
                    </div>

                    {/* Stand info */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-muted-foreground" />
                        <span className="font-semibold text-foreground">{stand.code}</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <MapPin className="w-4 h-4 text-muted-foreground mt-0.5" />
                        <span className="text-sm text-muted-foreground">{stand.address}</span>
                      </div>
                      {stand.width && stand.height && (
                        <div className="text-sm text-muted-foreground">
                          الأبعاد: {toArabicNumbers(stand.width)}م × {toArabicNumbers(stand.height)}م
                        </div>
                      )}
                      {showPrice && stand.export_price && (
                        <div className="pt-2 border-t border-border">
                          <span className="text-sm text-muted-foreground">سعر التصدير: </span>
                          <span className="font-bold text-success">
                            {formatCurrency(stand.export_price)}
                          </span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
