import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileDown, Building2, MapPin, Eye, EyeOff, Download, Image as ImageIcon, ImageOff, Loader2, ChevronDown } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatCurrency, safeNum, cn, computeContractStatus, toArabicNumbers } from '@/lib/utils'
import { useToast } from '@/contexts/ToastContext'
import { Button } from '@/components/ui/button'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { PageHeader, LoadingScreen } from '@/components/ui/shared'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'

// Helper function to check if text contains Arabic characters
const hasArabic = (text) => /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/.test(text)

export default function StandsExport() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [stands, setStands] = useState([])
  const [loading, setLoading] = useState(true)
  const [showPrice, setShowPrice] = useState(true)
  const [contractsMap, setContractsMap] = useState({})
  const [sortBy, setSortBy] = useState('az')
  const [exportLoading, setExportLoading] = useState(false)
  const [openExportAll, setOpenExportAll] = useState(false)
  const [openExportAvailable, setOpenExportAvailable] = useState(false)

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

  // Sort stands based on selected option
  const sortedStands = (stands || []).slice().sort((a, b) => {
    if (sortBy === 'az') return a.code.localeCompare(b.code, 'ar');
    if (sortBy === 'status') {
      const aStatus = getStandStatus(a).status;
      const bStatus = getStandStatus(b).status;
      // Available stands first
      if (aStatus === 'available' && bStatus !== 'available') return -1;
      if (aStatus !== 'available' && bStatus === 'available') return 1;
      return a.code.localeCompare(b.code, 'ar');
    }
    return 0;
  })

  const exportPDF = async ({ includePrice = true, onlyAvailable = false } = {}) => {
    let exportStands = sortedStands
    if (onlyAvailable) {
      exportStands = sortedStands.filter(stand => getStandStatus(stand).status === 'available')
    }

    if (exportStands.length === 0) {
      toast({
        title: 'لا توجد لوحات',
        description: onlyAvailable ? 'لا توجد لوحات متاحة للتصدير' : 'لا توجد لوحات للتصدير',
        variant: 'warning'
      })
      return
    }

    setExportLoading(true)
    try {
      // Preload all images to ensure they're loaded before printing
      const imageLoadPromises = exportStands
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
      padding: 5px;
    }
    .header {
      text-align: center;
      border-bottom: 2px solid #1E3A5F;
      padding-bottom: 10px;
      margin-bottom: 15px;
    }
    .company {
      font-size: 24px;
      font-weight: 900;
      color: #1E3A5F;
      letter-spacing: -1px;
    }
    .subtitle {
      font-size: 12px;
      color: #64748b;
      margin-top: 2px;
    }
    .page {
      page-break-after: always;
      page-break-inside: avoid;
      display: flex;
      flex-direction: column;
      gap: 10px;
      height: 950px;
    }
    .page:last-child {
      page-break-after: auto;
    }
    .page.first-page {
      height: 850px;
    }
    .card {
      border: 2px solid #e2e8f0;
      border-radius: 8px;
      overflow: hidden;
      flex: 1;
      display: flex;
      flex-direction: column;
      min-height: 0;
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
      flex: 1;
      min-height: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #e2e8f0;
    }
    .card-image img {
      width: auto;
      height: 100%;
      max-width: 100%;
      display: block;
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
      .page { page-break-after: always; }
      .page:last-child { page-break-after: auto; }
      .card { page-break-inside: avoid; }
    }
    @page {
      size: portrait;
      margin: 5mm;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="company">ڤيو</div>
    <div class="subtitle">${includePrice ? 'نظرة عامة على اللوحات' : 'اللوحات المتاحة للإيجار'} — الإجمالي: ${toArabicNumbers(exportStands.length)} لوحة — تاريخ التصدير: ${new Date().toLocaleDateString('ar-EG')}</div>
  </div>

  ${(() => {
    const pages = [];
    let isFirstPage = true;
    for (let i = 0; i < exportStands.length; i += 2) {
      const pageStands = exportStands.slice(i, i + 2);
      pages.push(`
  <div class="page${isFirstPage ? ' first-page' : ''}">
    ${pageStands.map(stand => {
      const statusInfo = getStandStatus(stand)
      const isRented = statusInfo.status !== 'available'
      const sidesLabel = stand.sides === 2 ? 'وجهين' : 'وجه'
      return `
    <div class="card ${isRented ? 'rented' : 'available'}">
      ${stand.photo_url ? `<div class="card-image"><img src="${stand.photo_url}" alt="${stand.code}" onerror="this.parentElement.innerHTML='<span style=\\'color:#94a3b8;font-size:18px;text-align:center;padding:20px;\\'>لا توجد صورة لهذه اللوحة بعد</span>'"/></div>` : `<div class="card-image"><span style="color:#94a3b8;font-size:18px;text-align:center;padding:20px;">لا توجد صورة لهذه اللوحة بعد</span></div>`}
      <div class="card-content">
        <div class="card-code">${stand.code || '—'}</div>
        ${stand.width && stand.height ? `<div class="card-dimensions">${toArabicNumbers(stand.width)}م × ${toArabicNumbers(stand.height)}م — ${sidesLabel}</div>` : ''}
        ${stand.address ? `<div class="card-address">${stand.address}</div>` : ''}
        <div class="card-status ${isRented ? 'rented' : 'available'}">${statusInfo.labelAr}</div>
        ${includePrice && stand.export_price ? `<div class="card-price">${toArabicNumbers(Number(stand.export_price).toLocaleString())} جنيه</div>` : ''}
      </div>
    </div>`
    }).join('')}
  </div>`);
      isFirstPage = false;
    }
    return pages.join('');
  })()}

  <div class="footer">
    ڤيو — نظام إدارة اللوحات الإعلانية © ${new Date().getFullYear()}
  </div>
</body>
</html>`

      const win = window.open('', '_blank')
      if (!win) {
        toast({
          title: 'تعذر فتح نافذة جديدة',
          description: 'يرجى السماح بالنوافذ المنبثقة في المتصفح ثم المحاولة مرة أخرى',
          variant: 'warning'
        })
        return
      }
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
    } catch (error) {
      console.error('Export error:', error)
      toast({
        title: 'خطأ',
        description: 'فشل في تصدير اللوحات',
        variant: 'error'
      })
    } finally {
      setExportLoading(false)
    }
  }

  if (loading) return <LoadingScreen />

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="تصدير اللوحات"
        description={`${toArabicNumbers(stands.length)} لوحة إجمالاً`}
      >
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-36 h-9">
            <SelectValue placeholder="ترتيب" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="az">أ-ي</SelectItem>
            <SelectItem value="status">حسب الحالة</SelectItem>
          </SelectContent>
        </Select>

        <Popover open={openExportAll} onOpenChange={setOpenExportAll}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="gap-2">
              <Download className="w-4 h-4" />
              تصدير الكل
              <ChevronDown className="w-3 h-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-2" align="end">
            <div className="flex flex-col gap-1">
              <Button
                variant="ghost"
                className="justify-start gap-2"
                onClick={() => {
                  setOpenExportAll(false)
                  exportPDF({ includePrice: true, onlyAvailable: false })
                }}
              >
                <Eye className="w-4 h-4" />
                مع السعر
              </Button>
              <Button
                variant="ghost"
                className="justify-start gap-2"
                onClick={() => {
                  setOpenExportAll(false)
                  exportPDF({ includePrice: false, onlyAvailable: false })
                }}
              >
                <EyeOff className="w-4 h-4" />
                بدون سعر
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        <Popover open={openExportAvailable} onOpenChange={setOpenExportAvailable}>
          <PopoverTrigger asChild>
            <Button className="gap-2">
              <FileDown className="w-4 h-4" />
              تصدير المتاح فقط
              <ChevronDown className="w-3 h-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-2" align="end">
            <div className="flex flex-col gap-1">
              <Button
                variant="ghost"
                className="justify-start gap-2"
                onClick={() => {
                  setOpenExportAvailable(false)
                  exportPDF({ includePrice: true, onlyAvailable: true })
                }}
              >
                <Eye className="w-4 h-4" />
                مع السعر
              </Button>
              <Button
                variant="ghost"
                className="justify-start gap-2"
                onClick={() => {
                  setOpenExportAvailable(false)
                  exportPDF({ includePrice: false, onlyAvailable: true })
                }}
              >
                <EyeOff className="w-4 h-4" />
                بدون سعر
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </PageHeader>



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
            {sortedStands.map(stand => {
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
                      {stand.photo_url ? (
                        <ImageIcon className="w-4 h-4 text-green-500" />
                      ) : (
                        <ImageOff className="w-4 h-4 text-red-400" />
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
                          الأبعاد: {toArabicNumbers(stand.width)}م × {toArabicNumbers(stand.height)}م — {stand.sides === 2 ? 'وجهين' : 'وجه'}
                        </div>
                      )}
                      {showPrice && stand.export_price && (
                        <div className="pt-2 border-t border-border">
                          <span className="text-sm text-muted-foreground">سعر الإيجار: </span>
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

      {/* Loading Dialog */}
      <Dialog open={exportLoading} onOpenChange={() => {}}>
        <DialogContent
          className="sm:max-w-[325px]"
          onInteractOutside={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          <DialogTitle className="sr-only">جاري التصدير</DialogTitle>
          <DialogDescription className="sr-only">يتم الآن إعداد ملف PDF للتصدير</DialogDescription>
          <div className="flex flex-col items-center justify-center gap-4 py-8">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-lg font-semibold">جاري إعداد التصدير...</p>
            <p className="text-sm text-muted-foreground">قد يستغرق هذا بضع ثوانٍ</p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
