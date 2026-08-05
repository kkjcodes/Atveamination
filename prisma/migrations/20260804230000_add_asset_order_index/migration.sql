-- User-arranged photo order. Default 0 for existing rows; queries sort by
-- (order_index, created_at) so untouched libraries keep upload order.
ALTER TABLE "assets" ADD COLUMN "order_index" INTEGER NOT NULL DEFAULT 0;
