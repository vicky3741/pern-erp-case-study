import request from 'supertest';
import { createApp } from '../../src/app';
import { TEST_PASSWORD } from './db';

/**
 * One Express instance for the whole suite, driven by supertest over an
 * ephemeral socket. Requests go through the real router, the real middleware
 * and the real error handler — the only thing not exercised is the network.
 */
export const app = createApp();

export async function loginAs(email: string): Promise<string> {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email, password: TEST_PASSWORD });

  if (res.status !== 200) {
    throw new Error(`login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body.data.token;
}

/** Convenience wrappers so tests read as requests rather than as supertest calls. */
export const api = {
  get: (path: string, token?: string) => auth(request(app).get(path), token),
  post: (path: string, body?: unknown, token?: string) =>
    auth(request(app).post(path).send(body ?? {}), token),
  patch: (path: string, body?: unknown, token?: string) =>
    auth(request(app).patch(path).send(body ?? {}), token),
};

function auth(req: request.Test, token?: string) {
  return token ? req.set('Authorization', `Bearer ${token}`) : req;
}

const today = () => new Date().toISOString().slice(0, 10);
const inAMonth = () => new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);

export interface QuotationLine {
  productId: string;
  quantity: number;
  unitPrice?: number;
  discountPercent?: number;
  gstPercent?: number;
}

/**
 * Walks the workflow up to a quotation: enquiry -> quotation.
 * Returns the ids the caller needs to carry on.
 */
export async function makeQuotation(token: string, customerId: string, lines: QuotationLine[]) {
  const enquiry = await api.post(
    '/api/enquiries',
    {
      customerId,
      enquiryDate: today(),
      requiredDate: inAMonth(),
      items: lines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
    },
    token,
  );
  if (enquiry.status !== 201) {
    throw new Error(`enquiry creation failed: ${JSON.stringify(enquiry.body)}`);
  }

  const quotation = await api.post(
    '/api/quotations',
    {
      enquiryId: enquiry.body.data.id,
      quotationDate: today(),
      validUntil: inAMonth(),
      items: lines,
    },
    token,
  );
  if (quotation.status !== 201) {
    throw new Error(`quotation creation failed: ${JSON.stringify(quotation.body)}`);
  }

  return { enquiry: enquiry.body.data, quotation: quotation.body.data };
}

/** Moves a quotation DRAFT -> SENT -> ACCEPTED. */
export async function acceptQuotation(token: string, quotationId: string) {
  await api.patch(`/api/quotations/${quotationId}/status`, { status: 'SENT' }, token);
  const res = await api.patch(
    `/api/quotations/${quotationId}/status`,
    { status: 'ACCEPTED' },
    token,
  );
  if (res.status !== 200) throw new Error(`accept failed: ${JSON.stringify(res.body)}`);
  return res.body.data;
}

/**
 * The full path to a PENDING sales order: enquiry -> quotation -> accepted ->
 * converted. Used by the reservation tests, which care about what happens
 * after this point.
 */
export async function makeSalesOrder(
  token: string,
  customerId: string,
  lines: QuotationLine[],
) {
  const { quotation } = await makeQuotation(token, customerId, lines);
  await acceptQuotation(token, quotation.id);

  const converted = await api.post(`/api/quotations/${quotation.id}/convert`, {}, token);
  if (converted.status !== 201) {
    throw new Error(`conversion failed: ${JSON.stringify(converted.body)}`);
  }

  return { quotation, order: converted.body.data };
}

export const dates = { today, inAMonth };
