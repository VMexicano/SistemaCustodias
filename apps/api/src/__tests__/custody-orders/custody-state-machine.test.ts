import { CustodyStateMachine } from '../../modules/custody-orders/custody-state-machine.js';
import type { OrderStatus } from '../../modules/custody-orders/custody-orders.types.js';

describe('CustodyStateMachine', () => {
  describe('validateTransition — valid transitions', () => {
    const validCases: [OrderStatus, OrderStatus][] = [
      ['DRAFT', 'PENDING_APPROVAL'],
      ['DRAFT', 'CANCELLED'],
      ['PENDING_APPROVAL', 'APPROVED'],
      ['PENDING_APPROVAL', 'REJECTED'],
      ['PENDING_APPROVAL', 'CANCELLED'],
      ['APPROVED', 'ASSIGNED'],
      ['APPROVED', 'CANCELLED'],
      ['ASSIGNED', 'CREW_CONFIRMED'],
      ['ASSIGNED', 'REASSIGNED'],
      ['REASSIGNED', 'CREW_CONFIRMED'],
      ['CREW_CONFIRMED', 'EN_ROUTE_TO_PICKUP'],
      ['EN_ROUTE_TO_PICKUP', 'AT_PICKUP'],
      ['AT_PICKUP', 'IN_TRANSIT'],
      ['AT_PICKUP', 'PICKUP_FAILED'],
      ['IN_TRANSIT', 'AT_DELIVERY'],
      ['IN_TRANSIT', 'INCIDENT'],
      ['AT_DELIVERY', 'DELIVERED'],
      ['AT_DELIVERY', 'DELIVERY_FAILED'],
      ['DELIVERED', 'COMPLETED'],
      ['INCIDENT', 'IN_TRANSIT'],
      ['INCIDENT', 'RESOLVED'],
    ];

    it.each(validCases)('allows %s → %s', (from, to) => {
      expect(() => CustodyStateMachine.validateTransition(from, to)).not.toThrow();
    });
  });

  describe('validateTransition — invalid transitions', () => {
    const invalidCases: [OrderStatus, OrderStatus][] = [
      ['DRAFT', 'APPROVED'],
      ['DRAFT', 'IN_TRANSIT'],
      ['PENDING_APPROVAL', 'ASSIGNED'],
      ['PENDING_APPROVAL', 'IN_TRANSIT'],
      ['APPROVED', 'PENDING_APPROVAL'],
      ['APPROVED', 'IN_TRANSIT'],
      ['ASSIGNED', 'APPROVED'],
      ['CREW_CONFIRMED', 'ASSIGNED'],
      ['IN_TRANSIT', 'DRAFT'],
      ['DELIVERED', 'IN_TRANSIT'],
      ['COMPLETED', 'DRAFT'],
      ['COMPLETED', 'CANCELLED'],
      ['REJECTED', 'APPROVED'],
      ['CANCELLED', 'DRAFT'],
      ['PICKUP_FAILED', 'AT_PICKUP'],
      ['DELIVERY_FAILED', 'AT_DELIVERY'],
      ['RESOLVED', 'IN_TRANSIT'],
    ];

    it.each(invalidCases)('throws INVALID_ORDER_TRANSITION for %s → %s', (from, to) => {
      expect(() => CustodyStateMachine.validateTransition(from, to)).toThrow();
      expect(() => CustodyStateMachine.validateTransition(from, to)).toThrow(
        expect.objectContaining({ code: 'INVALID_ORDER_TRANSITION' }),
      );
    });
  });

  describe('isFinal', () => {
    const finalStatuses: OrderStatus[] = [
      'COMPLETED', 'REJECTED', 'CANCELLED', 'PICKUP_FAILED', 'DELIVERY_FAILED', 'RESOLVED',
    ];
    const nonFinalStatuses: OrderStatus[] = [
      'DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'ASSIGNED', 'REASSIGNED',
      'CREW_CONFIRMED', 'EN_ROUTE_TO_PICKUP', 'AT_PICKUP',
      'IN_TRANSIT', 'AT_DELIVERY', 'DELIVERED', 'INCIDENT',
    ];

    it.each(finalStatuses)('%s is a final status', (status) => {
      expect(CustodyStateMachine.isFinal(status)).toBe(true);
    });

    it.each(nonFinalStatuses)('%s is NOT a final status', (status) => {
      expect(CustodyStateMachine.isFinal(status)).toBe(false);
    });
  });

  describe('getAllowedTransitions', () => {
    it('returns correct transitions for DRAFT', () => {
      const allowed = CustodyStateMachine.getAllowedTransitions('DRAFT');
      expect(allowed).toEqual(expect.arrayContaining(['PENDING_APPROVAL', 'CANCELLED']));
      expect(allowed).toHaveLength(2);
    });

    it('returns empty array for COMPLETED', () => {
      expect(CustodyStateMachine.getAllowedTransitions('COMPLETED')).toEqual([]);
    });

    it('returns correct transitions for INCIDENT', () => {
      const allowed = CustodyStateMachine.getAllowedTransitions('INCIDENT');
      expect(allowed).toEqual(expect.arrayContaining(['IN_TRANSIT', 'RESOLVED']));
    });

    it('returns a copy — mutation does not affect the original', () => {
      const allowed = CustodyStateMachine.getAllowedTransitions('DRAFT');
      allowed.push('COMPLETED');
      expect(CustodyStateMachine.getAllowedTransitions('DRAFT')).toHaveLength(2);
    });
  });

  describe('isValidStatus', () => {
    it('returns true for valid status strings', () => {
      expect(CustodyStateMachine.isValidStatus('DRAFT')).toBe(true);
      expect(CustodyStateMachine.isValidStatus('IN_TRANSIT')).toBe(true);
      expect(CustodyStateMachine.isValidStatus('COMPLETED')).toBe(true);
    });

    it('returns false for invalid status strings', () => {
      expect(CustodyStateMachine.isValidStatus('UNKNOWN')).toBe(false);
      expect(CustodyStateMachine.isValidStatus('')).toBe(false);
      expect(CustodyStateMachine.isValidStatus('draft')).toBe(false);
    });
  });
});
