// ---------------------------------------------------------------------------
// custody-payments.types.ts — shared types for custody payments module
// ---------------------------------------------------------------------------

export type CustodyPaymentStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'refunded';

export interface CustodyPayment {
  id: string;
  order_id: string;
  amount_mxn: string;
  status: CustodyPaymentStatus;
  stripe_payment_intent_id: string | null;
  paid_at: string | null;
  failed_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface CustodyPaymentJobData {
  orderId: string;
  tenantId: string;
}
