/**
 * Types shared with the API. These mirror what each service actually returns
 * — see the `include` blocks in the corresponding backend service file if a
 * shape here ever looks surprising.
 */

// ------------------------------- auth ---------------------------------------

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

// ------------------------------ customers -----------------------------------

export interface Customer {
  id: string;
  companyName: string;
  contactPerson: string;
  mobile: string;
  email: string;
  city: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerDetail extends Customer {
  _count: { enquiries: number; quotations: number; salesOrders: number };
  enquiries: Array<{
    id: string;
    enquiryNumber: string;
    enquiryDate: string;
    status: EnquiryStatus;
    _count: { items: number };
  }>;
}

// -------------------------- products & inventory -----------------------------

export interface InventorySnapshot {
  physicalQty: number;
  reservedQty: number;
  availableQty: number;
}

export interface Product {
  id: string;
  productCode: string;
  name: string;
  category: string;
  unit: string;
  basePrice: string;
  isActive: boolean;
  inventory: InventorySnapshot;
}

/** The flattened shape /inventory and /inventory/:productId return. */
export interface InventoryRow extends InventorySnapshot {
  id: string;
  productCode: string;
  name: string;
  unit: string;
  category?: string;
  basePrice?: string;
  updatedAt: string | null;
}

// ------------------------------- enquiries ----------------------------------

export interface EnquiryItem {
  id: string;
  quantity: number;
  notes: string | null;
  productId: string;
  product: { id: string; productCode: string; name: string; unit: string; basePrice: string };
}

export interface EnquiryListRow {
  id: string;
  enquiryNumber: string;
  enquiryDate: string;
  requiredDate: string;
  status: EnquiryStatus;
  notes: string | null;
  createdAt: string;
  customer: { id: string; companyName: string; city: string };
  _count: { items: number; quotations: number };
}

export interface EnquiryDetail extends Omit<EnquiryListRow, 'customer' | '_count'> {
  customer: Customer;
  createdBy: { id: string; name: string; email: string };
  items: EnquiryItem[];
  quotations: Array<{
    id: string;
    quotationNumber: string;
    status: QuotationStatus;
    grandTotal: string;
    validUntil: string;
  }>;
}

// ------------------------------- quotations ---------------------------------

export interface QuotationItem {
  id: string;
  quantity: number;
  unitPrice: string;
  discountPercent: string;
  gstPercent: string;
  lineAmount: string;
  productId: string;
  product: { id: string; productCode: string; name: string; unit: string; basePrice: string };
}

export interface QuotationListRow {
  id: string;
  quotationNumber: string;
  quotationDate: string;
  validUntil: string;
  status: QuotationStatus;
  subTotal: string;
  totalDiscount: string;
  totalGst: string;
  grandTotal: string;
  createdAt: string;
  customer: { id: string; companyName: string; city: string };
  enquiry: { id: string; enquiryNumber: string };
  salesOrder: { id: string; orderNumber: string; status: SalesOrderStatus } | null;
  _count: { items: number };
}

export interface QuotationDetail
  extends Omit<QuotationListRow, 'customer' | 'enquiry' | 'salesOrder' | '_count'> {
  customer: Customer;
  enquiry: {
    id: string;
    enquiryNumber: string;
    enquiryDate: string;
    requiredDate: string;
    status: EnquiryStatus;
  };
  createdBy: { id: string; name: string };
  items: QuotationItem[];
  salesOrder: { id: string; orderNumber: string; status: SalesOrderStatus } | null;
}

// ------------------------------ sales orders ---------------------------------

export interface SalesOrderItem {
  id: string;
  quantity: number;
  unitPrice: string;
  lineAmount: string;
  dispatchedQty: number;
  remainingQty: number;
  productId: string;
  product: { id: string; productCode: string; name: string; unit: string };
  stock: InventorySnapshot;
}

export interface SalesOrderListRow {
  id: string;
  orderNumber: string;
  orderDate: string;
  status: SalesOrderStatus;
  totalAmount: string;
  createdAt: string;
  customer: { id: string; companyName: string; city: string };
  quotation: { id: string; quotationNumber: string };
  _count: { items: number; dispatches: number };
}

export interface SalesOrderDetail
  extends Omit<SalesOrderListRow, 'customer' | 'quotation' | '_count'> {
  customer: Customer;
  quotation: {
    id: string;
    quotationNumber: string;
    status: QuotationStatus;
    grandTotal: string;
    enquiry: { id: string; enquiryNumber: string };
  };
  createdBy: { id: string; name: string };
  confirmedBy: { id: string; name: string } | null;
  confirmedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  items: SalesOrderItem[];
  dispatches: Array<{
    id: string;
    dispatchNumber: string;
    dispatchDate: string;
    vehicleNumber: string;
    driverName: string;
  }>;
}

// -------------------------------- dispatches ----------------------------------

export interface DispatchDetail {
  id: string;
  dispatchNumber: string;
  dispatchDate: string;
  vehicleNumber: string;
  driverName: string;
  createdAt: string;
  salesOrder: {
    id: string;
    orderNumber: string;
    status: SalesOrderStatus;
    customer: { id: string; companyName: string; city: string };
  };
  createdBy: { id: string; name: string };
  items: Array<{
    id: string;
    quantity: number;
    product: { id: string; productCode: string; name: string; unit: string };
  }>;
}
