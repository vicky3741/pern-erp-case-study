-- Database-level guarantees for inventory and document lines.
--
-- Prisma's schema language cannot express CHECK constraints, so they are added
-- here as raw SQL. They are the last line of defence: the reservation and
-- dispatch services already validate quantities inside a locked transaction,
-- but a bug in that code -- or a manual UPDATE run against the database -- must
-- still not be able to write an impossible stock level.
--
--   physical_qty >= 0                you cannot have negative stock
--   reserved_qty >= 0                you cannot un-reserve what was never reserved
--   reserved_qty <= physical_qty     you cannot promise more than you hold
--
-- The third is the one that matters most: it makes over-reservation
-- unrepresentable, so the worst case for a concurrency bug is a failed
-- transaction rather than corrupt stock.

ALTER TABLE "inventory"
  ADD CONSTRAINT "inventory_physical_qty_non_negative"
  CHECK ("physicalQty" >= 0);

ALTER TABLE "inventory"
  ADD CONSTRAINT "inventory_reserved_qty_non_negative"
  CHECK ("reservedQty" >= 0);

ALTER TABLE "inventory"
  ADD CONSTRAINT "inventory_reserved_not_above_physical"
  CHECK ("reservedQty" <= "physicalQty");

-- Quantities on every document line must be positive. A zero or negative line
-- would otherwise sail through as a no-op or, worse, as a stock increase.

ALTER TABLE "enquiry_items"
  ADD CONSTRAINT "enquiry_items_quantity_positive" CHECK ("quantity" > 0);

ALTER TABLE "quotation_items"
  ADD CONSTRAINT "quotation_items_quantity_positive" CHECK ("quantity" > 0);

ALTER TABLE "dispatch_items"
  ADD CONSTRAINT "dispatch_items_quantity_positive" CHECK ("quantity" > 0);

-- A sales order line can never have dispatched more than was ordered, and
-- dispatchedQty cannot go negative if a dispatch is ever reversed.

ALTER TABLE "sales_order_items"
  ADD CONSTRAINT "sales_order_items_quantity_positive" CHECK ("quantity" > 0);

ALTER TABLE "sales_order_items"
  ADD CONSTRAINT "sales_order_items_dispatched_within_ordered"
  CHECK ("dispatchedQty" >= 0 AND "dispatchedQty" <= "quantity");

-- Percentages on a quotation line are percentages.

ALTER TABLE "quotation_items"
  ADD CONSTRAINT "quotation_items_discount_percent_range"
  CHECK ("discountPercent" >= 0 AND "discountPercent" <= 100);

ALTER TABLE "quotation_items"
  ADD CONSTRAINT "quotation_items_gst_percent_range"
  CHECK ("gstPercent" >= 0 AND "gstPercent" <= 100);
