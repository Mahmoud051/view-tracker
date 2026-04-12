-- Add export_price column to stands table
-- This column is only used for the stands export PDF page
-- It allows you to show clients a price without affecting the actual contract prices

ALTER TABLE stands
ADD COLUMN IF NOT EXISTS export_price NUMERIC(10, 2);

-- Optional: Add a comment to document the purpose of this column
COMMENT ON COLUMN stands.export_price IS 'Price shown to clients in export PDF only - not used in contracts or anywhere else in the app';

-- Example: Update existing stands with export prices (uncomment and modify as needed)
-- UPDATE stands SET export_price = 5000 WHERE code = 'STAND-001';
-- UPDATE stands SET export_price = 7500 WHERE code = 'STAND-002';
-- UPDATE stands SET export_price = 6000 WHERE code = 'STAND-003';
