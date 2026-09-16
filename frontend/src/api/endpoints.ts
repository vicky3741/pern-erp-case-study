import { apiClient, type ApiListResponse, type ApiResponse } from './client';
import type {
  AuthUser,
  Customer,
  CustomerDetail,
  DispatchDetail,
  EnquiryDetail,
  EnquiryListRow,
  EnquiryStatus,
  InventoryRow,
  Product,
  QuotationDetail,
  QuotationListRow,
  QuotationStatus,
  SalesOrderDetail,
  SalesOrderListRow,
} from '@/types/api';

/** One object per API module. Each function unwraps the API envelope so
 * callers deal in plain domain objects and typed lists. */

export const authApi = {
  async login(email: string, password: string) {
    const { data } = await apiClient.post<ApiResponse<{ token: string; user: AuthUser }>>(
      '/auth/login',
      { email, password },
    );
    return data.data;
  },

  async me() {
    const { data } = await apiClient.get<ApiResponse<AuthUser>>('/auth/me');
    return data.data;
  },
};

export const customersApi = {
  async list(params: { search?: string; page?: number; limit?: number } = {}) {
    const { data } = await apiClient.get<ApiListResponse<Customer>>('/customers', { params });
    return data;
  },

  async getById(id: string) {
    const { data } = await apiClient.get<ApiResponse<CustomerDetail>>(`/customers/${id}`);
    return data.data;
  },

  async create(input: {
    companyName: string;
    contactPerson: string;
    mobile: string;
    email: string;
    city: string;
  }) {
    const { data } = await apiClient.post<ApiResponse<Customer>>('/customers', input);
    return data.data;
  },
};

export const productsApi = {
  async list(params: { search?: string; category?: string; page?: number; limit?: number } = {}) {
    const { data } = await apiClient.get<ApiListResponse<Product>>('/products', { params });
    return data;
  },
};

export const inventoryApi = {
  async list(params: { search?: string; page?: number; limit?: number } = {}) {
    const { data } = await apiClient.get<ApiListResponse<InventoryRow>>('/inventory', { params });
    return data;
  },

  async getForProduct(productId: string) {
    const { data } = await apiClient.get<ApiResponse<InventoryRow>>(`/inventory/${productId}`);
    return data.data;
  },
};

export interface CreateEnquiryInput {
  customerId: string;
  enquiryDate: string;
  requiredDate: string;
  notes?: string;
  items: Array<{ productId: string; quantity: number; notes?: string }>;
}

export const enquiriesApi = {
  async list(params: { status?: EnquiryStatus; search?: string; page?: number; limit?: number } = {}) {
    const { data } = await apiClient.get<ApiListResponse<EnquiryListRow>>('/enquiries', { params });
    return data;
  },

  async getById(id: string) {
    const { data } = await apiClient.get<ApiResponse<EnquiryDetail>>(`/enquiries/${id}`);
    return data.data;
  },

  async create(input: CreateEnquiryInput) {
    const { data } = await apiClient.post<ApiResponse<EnquiryDetail>>('/enquiries', input);
    return data.data;
  },

  async updateStatus(id: string, status: EnquiryStatus) {
    const { data } = await apiClient.patch<ApiResponse<EnquiryDetail>>(
      `/enquiries/${id}/status`,
      { status },
    );
    return data.data;
  },
};

export interface CreateQuotationItemInput {
  productId: string;
  quantity: number;
  unitPrice?: number;
  discountPercent?: number;
  gstPercent?: number;
}

export interface CreateQuotationInput {
  enquiryId: string;
  quotationDate?: string;
  validUntil: string;
  items: CreateQuotationItemInput[];
}

export const quotationsApi = {
  async list(
    params: {
      status?: QuotationStatus;
      enquiryId?: string;
      search?: string;
      page?: number;
      limit?: number;
    } = {},
  ) {
    const { data } = await apiClient.get<ApiListResponse<QuotationListRow>>('/quotations', {
      params,
    });
    return data;
  },

  async getById(id: string) {
    const { data } = await apiClient.get<ApiResponse<QuotationDetail>>(`/quotations/${id}`);
    return data.data;
  },

  async create(input: CreateQuotationInput) {
    const { data } = await apiClient.post<ApiResponse<QuotationDetail>>('/quotations', input);
    return data.data;
  },

  async updateStatus(id: string, status: QuotationStatus) {
    const { data } = await apiClient.patch<ApiResponse<QuotationDetail>>(
      `/quotations/${id}/status`,
      { status },
    );
    return data.data;
  },

  async convert(id: string) {
    const { data } = await apiClient.post<ApiResponse<SalesOrderDetail>>(
      `/quotations/${id}/convert`,
    );
    return data.data;
  },
};

export interface DispatchLineInput {
  productId: string;
  quantity: number;
}

export interface CreateDispatchInput {
  dispatchDate?: string;
  vehicleNumber: string;
  driverName: string;
  items: DispatchLineInput[];
}

export const salesOrdersApi = {
  async list(
    params: {
      status?: string;
      customerId?: string;
      search?: string;
      page?: number;
      limit?: number;
    } = {},
  ) {
    const { data } = await apiClient.get<ApiListResponse<SalesOrderListRow>>('/sales-orders', {
      params,
    });
    return data;
  },

  async getById(id: string) {
    const { data } = await apiClient.get<ApiResponse<SalesOrderDetail>>(`/sales-orders/${id}`);
    return data.data;
  },

  async confirm(id: string) {
    const { data } = await apiClient.post<ApiResponse<SalesOrderDetail>>(
      `/sales-orders/${id}/confirm`,
    );
    return data.data;
  },

  async cancel(id: string, reason: string) {
    const { data } = await apiClient.post<ApiResponse<SalesOrderDetail>>(
      `/sales-orders/${id}/cancel`,
      { reason },
    );
    return data.data;
  },

  async dispatch(id: string, input: CreateDispatchInput) {
    const { data } = await apiClient.post<ApiResponse<DispatchDetail>>(
      `/sales-orders/${id}/dispatch`,
      input,
    );
    return data.data;
  },
};
