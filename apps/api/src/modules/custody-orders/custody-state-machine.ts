import { BusinessError } from '../../shared/errors/business-error.js';
import type { OrderStatus } from './custody-orders.types.js';

const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  DRAFT:              ['PENDING_APPROVAL', 'CANCELLED'],
  PENDING_APPROVAL:   ['APPROVED', 'REJECTED', 'CANCELLED'],
  APPROVED:           ['ASSIGNED', 'CANCELLED'],
  ASSIGNED:           ['CREW_CONFIRMED', 'REASSIGNED'],
  REASSIGNED:         ['CREW_CONFIRMED'],
  CREW_CONFIRMED:     ['EN_ROUTE_TO_PICKUP'],
  EN_ROUTE_TO_PICKUP: ['AT_PICKUP'],
  AT_PICKUP:          ['IN_TRANSIT', 'PICKUP_FAILED'],
  IN_TRANSIT:         ['AT_DELIVERY', 'INCIDENT'],
  AT_DELIVERY:        ['DELIVERED', 'DELIVERY_FAILED'],
  DELIVERED:          ['COMPLETED'],
  INCIDENT:           ['IN_TRANSIT', 'RESOLVED'],
  COMPLETED:          [],
  REJECTED:           [],
  CANCELLED:          [],
  PICKUP_FAILED:      [],
  DELIVERY_FAILED:    [],
  RESOLVED:           [],
};

export class CustodyStateMachine {
  static validateTransition(from: OrderStatus, to: OrderStatus): void {
    const allowed = VALID_TRANSITIONS[from];
    if (!allowed.includes(to)) {
      throw new BusinessError(
        'INVALID_ORDER_TRANSITION',
        `Cannot transition from ${from} to ${to}`,
      );
    }
  }

  static isFinal(status: OrderStatus): boolean {
    return VALID_TRANSITIONS[status].length === 0;
  }

  static getAllowedTransitions(status: OrderStatus): OrderStatus[] {
    return [...VALID_TRANSITIONS[status]];
  }

  static isValidStatus(status: string): status is OrderStatus {
    return Object.prototype.hasOwnProperty.call(VALID_TRANSITIONS, status);
  }
}
