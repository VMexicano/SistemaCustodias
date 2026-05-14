export type OrderStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'ASSIGNED'
  | 'REASSIGNED'
  | 'CREW_CONFIRMED'
  | 'EN_ROUTE_TO_PICKUP'
  | 'AT_PICKUP'
  | 'PICKUP_FAILED'
  | 'IN_TRANSIT'
  | 'AT_DELIVERY'
  | 'DELIVERY_FAILED'
  | 'DELIVERED'
  | 'COMPLETED'
  | 'INCIDENT'
  | 'RESOLVED';

export interface Address {
  street: string;
  city: string;
  state: string;
  zip?: string;
  lat?: number;
  lng?: number;
  reference?: string;
}

export interface CustodySnapshot {
  order_id: string;
  order_number: string;
  custody_type: { slug: string; name: string };
  value_declaration: Record<string, unknown>;
  client: { id: string; name: string };
  custodio: { id: string; name: string; license: string };
  copiloto: { id: string; name: string; license: string };
  vehicle: { id: string; plate: string; model: string };
  pickup_address: Address;
  delivery_address: Address;
  in_transit_at: string;
}

export interface PricingSnapshot {
  base_price_mxn: number;
  distance_km: number;
  per_km_price_mxn: number;
  subtotal_mxn: number;
  iva_mxn: number;
  total_mxn: number;
  rule_id: string;
  calculated_at: string;
}

export interface CustodyOrder {
  id: string;
  order_number: string;
  client_id: string;
  custody_type_id: string;
  tenant_id: string;
  status: OrderStatus;
  pickup_address: Address;
  delivery_address: Address;
  scheduled_at: Date | null;
  pickup_window_start: Date | null;
  pickup_window_end: Date | null;
  custodio_id: string | null;
  copiloto_id: string | null;
  custodio_confirmed_at: Date | null;
  copiloto_confirmed_at: Date | null;
  approved_by: string | null;
  approved_at: Date | null;
  rejected_reason: string | null;
  custody_snapshot: CustodySnapshot | null;
  pricing_snapshot: PricingSnapshot | null;
  notes: string | null;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface OrderTransition {
  id: string;
  order_id: string;
  from_status: OrderStatus;
  to_status: OrderStatus;
  actor_id: string | null;
  actor_role: string | null;
  location: unknown | null;
  notes: string | null;
  digital_signature: string | null;
  created_at: Date;
}

export interface CustodyOrderDTO {
  id: string;
  orderNumber: string;
  clientId: string;
  custodyTypeId: string;
  tenantId: string;
  status: OrderStatus;
  pickupAddress: Address;
  deliveryAddress: Address;
  scheduledAt: string | null;
  pickupWindowStart: string | null;
  pickupWindowEnd: string | null;
  custodioId: string | null;
  copilotoId: string | null;
  custodioConfirmedAt: string | null;
  copilotoConfirmedAt: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  rejectedReason: string | null;
  custodySnapshot: CustodySnapshot | null;
  pricingSnapshot: PricingSnapshot | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrderTransitionDTO {
  id: string;
  orderId: string;
  fromStatus: OrderStatus;
  toStatus: OrderStatus;
  actorId: string | null;
  actorRole: string | null;
  notes: string | null;
  digitalSignature: string | null;
  createdAt: string;
}

export interface CreateOrderInput {
  clientId: string;
  custodyTypeId: string;
  tenantId: string;
  pickupAddress: Address;
  deliveryAddress: Address;
  scheduledAt?: string;
  pickupWindowStart?: string;
  pickupWindowEnd?: string;
  notes?: string;
}

export interface Actor {
  userId: string;
  role: string;
}
