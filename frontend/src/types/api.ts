/**
 * Types shared with the API. These mirror the Prisma enums exactly — if one
 * changes in the schema it must change here too.
 *
 * Entity interfaces (Customer, Enquiry, Quotation, SalesOrder, …) are added to
 * this file as each module is built.
 */

/** Only two roles exist in this system. */
export type Role = 'ADMIN' | 'SALES';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

// ------------------------- workflow status enums ----------------------------
// The lifecycle of each document, as described in the brief.

/** NEW → QUOTED → WON / LOST */
export type EnquiryStatus = 'NEW' | 'QUOTED' | 'WON' | 'LOST';

/** DRAFT → SENT → ACCEPTED / REJECTED */
export type QuotationStatus = 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED';

/** PENDING → CONFIRMED → DISPATCHED / CANCELLED */
export type SalesOrderStatus = 'PENDING' | 'CONFIRMED' | 'DISPATCHED' | 'CANCELLED';
