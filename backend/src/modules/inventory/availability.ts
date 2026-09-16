/**
 * The one and only definition of available stock in this application.
 *
 *   available = physical - reserved
 *
 * It is a function, not a column, and it lives in a single file so the rule
 * cannot drift between endpoints. Every place that needs availability — the
 * product list, the inventory screen, the sales order detail, the reservation
 * check — goes through here.
 *
 * Storing availability as a third column would mean three numbers that can
 * disagree with each other, with nothing in the schema to say which one is
 * authoritative. Deriving it makes disagreement impossible.
 *
 * When the live verification round asks for DAMAGED stock, this is the file to
 * change first: add damagedQty to the snapshot and subtract it here, and every
 * caller is correct immediately.
 */
export interface InventorySnapshot {
  physicalQty: number;
  reservedQty: number;
}

export function availableQty(inventory: InventorySnapshot | null | undefined): number {
  if (!inventory) return 0;
  return inventory.physicalQty - inventory.reservedQty;
}

/** Returns the inventory row with `availableQty` attached, for API responses. */
export function withAvailability<T extends InventorySnapshot>(
  inventory: T,
): T & { availableQty: number } {
  return { ...inventory, availableQty: availableQty(inventory) };
}

/**
 * Shapes a product's inventory for an API response, tolerating the (impossible
 * by construction, but nullable in the type) case of a product with no
 * inventory row.
 */
export function inventoryResponse(inventory: InventorySnapshot | null | undefined) {
  return {
    physicalQty: inventory?.physicalQty ?? 0,
    reservedQty: inventory?.reservedQty ?? 0,
    availableQty: availableQty(inventory),
  };
}
