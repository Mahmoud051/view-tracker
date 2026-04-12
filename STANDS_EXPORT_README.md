# Stands Export PDF Feature

## Overview
A new page has been added that allows you to export PDFs showing all stands with their rental status. There are **two export modes**:

1. **Internal Export (Full Details)** - Shows everything including export prices
2. **Client Export (No Prices)** - Shows stand details without prices for sharing with clients/employees

## What Was Created

### 1. New Page: `StandsExport.jsx`
Located at: `src/pages/StandsExport.jsx`

**Features:**
- Preview of all stands with color-coded status
- Two export buttons (Internal with prices / Client without prices)
- PDF includes:
  - Summary table with all stands
  - Visual color-coded grid (green = available, red = rented, amber = open contract)
  - Stand code, location, dimensions, status, and optionally price
  - Professional formatting with page numbers

### 2. Navigation Link Added
The page is accessible from the sidebar as **"تصدير اللوحات"** (Stands Export)

### 3. New Database Column
A new column `export_price` has been added to the `stands` table.

## SQL Migration Required

Run this SQL file in your Supabase SQL editor:

```sql
File: add_export_price_column.sql
```

This adds the `export_price` column to the `stands` table. This column:
- Is ONLY used for the PDF export page
- Does NOT affect contract prices or any other part of the app
- Allows you to set a display price for showing clients what stands cost

### After Running the SQL:

You'll need to set the export prices for your stands. You can do this with UPDATE statements like:

```sql
UPDATE stands SET export_price = 5000 WHERE code = 'YOUR-STAND-CODE';
UPDATE stands SET export_price = 7500 WHERE code = 'ANOTHER-STAND';
-- etc...
```

Or you can add an `export_price` input field to your Stands management page if you want to edit it through the UI.

## How to Use

1. **Navigate to "تصدير اللوحات"** in the sidebar
2. **Preview** all stands with their status (green = available, red = rented)
3. **Choose export mode:**
   - Click **"تصدير داخلي (كامل التفاصيل)"** for internal use with prices
   - Click **"تصدير للعملاء (بدون سعر)"** for clients without prices
4. **The PDF downloads automatically** with:
   - A summary table
   - A visual grid of all stands
   - Color-coded status indicators
   - Page numbers and footers

## PDF Layout

### Page 1: Summary Table
- All stands in a formatted table
- Color-coded status column (green/amber/red backgrounds)
- Price column (only in internal export)

### Page 2+: Visual Grid
- 3 stands per row in color-coded boxes
- Green boxes = Available stands
- Red boxes = Rented stands
- Shows: Code, dimensions, status, and price (if internal)

## Color Coding

- **🟢 Green** - Available for rent
- **🔴 Red** - Currently rented (shows days remaining if applicable)
- **🟡 Amber** - Rented with open contract

## Technical Details

### Libraries Added:
- `jspdf` - PDF generation
- `jspdf-autotable` - Table formatting in PDFs

### Files Modified:
1. `src/pages/StandsExport.jsx` - New page (created)
2. `src/App.jsx` - Added route
3. `src/components/Sidebar.jsx` - Added navigation link
4. `package.json` - Added jspdf dependencies

### Database Changes:
- Added `export_price` column to `stands` table (SQL migration provided)

## Next Steps (Optional Enhancements)

If you want to add stand images to the PDF in the future:
1. Add an `image_url` column to the stands table
2. Store image URLs in Supabase Storage
3. The PDF can be enhanced to include those images

The current implementation uses placeholders where images would go, making it easy to add them later.
