import { apiClient, type ApiResponse } from './client';
import type { AuthUser } from '@/types/api';

/**
 * One object per API module. Each function unwraps the `{ success, data }`
 * envelope so callers deal in plain domain objects.
 *
 * customersApi, enquiriesApi, productsApi, inventoryApi, quotationsApi and
 * salesOrdersApi are added here as each module is built.
 */

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
