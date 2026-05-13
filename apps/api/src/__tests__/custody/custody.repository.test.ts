/**
 * custody.repository.test.ts — unit tests for CustodyRepository
 *
 * All DB calls are mocked via Knex fluent-API stubs.
 */

import { CustodyRepository } from '../../modules/custody/custody.repository.js';
import type { CreateCustodyEventInput } from '../../modules/custody/custody.repository.js';

// ---------------------------------------------------------------------------
// Knex builder factories
// ---------------------------------------------------------------------------

function makeMaxBuilder(seqValue: number | null) {
  return {
    where: jest.fn().mockReturnThis(),
    max: jest.fn().mockReturnThis(),
    first: jest.fn().mockResolvedValue({ seq: seqValue }),
  };
}

function makeInsertBuilder(returnRow: object) {
  return {
    insert: jest.fn().mockReturnThis(),
    returning: jest.fn().mockResolvedValue([returnRow]),
  };
}

function makeSelectBuilder(rows: object[]) {
  return {
    leftJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockResolvedValue(rows),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CustodyRepository', () => {
  describe('createEvent()', () => {
    const baseInput: CreateCustodyEventInput = {
      tripId: 'trip-1',
      eventType: 'pick_up',
      actorId: 'actor-1',
    };

    const sampleRow = {
      id: 'ev-1',
      trip_id: 'trip-1',
      event_type: 'pick_up',
      actor_id: 'actor-1',
      signature_url: null,
      photo_url: null,
      declared_value: null,
      notes: null,
      lat: null,
      lng: null,
      occurred_at: new Date().toISOString(),
      sequence: 1,
    };

    it('starts sequence at 1 when no previous events (seq = null)', async () => {
      const maxBuilder = makeMaxBuilder(null);
      const insertBuilder = makeInsertBuilder(sampleRow);
      const db = jest.fn()
        .mockReturnValueOnce(maxBuilder)
        .mockReturnValueOnce(insertBuilder);

      const repo = new CustodyRepository(db as never);
      const result = await repo.createEvent(baseInput);

      expect(insertBuilder.insert).toHaveBeenCalledWith(
        expect.objectContaining({ sequence: 1 }),
      );
      expect(result.actor_name).toBeNull();
    });

    it('increments sequence when previous events exist (seq = 3)', async () => {
      const maxBuilder = makeMaxBuilder(3);
      const insertBuilder = makeInsertBuilder({ ...sampleRow, sequence: 4 });
      const db = jest.fn()
        .mockReturnValueOnce(maxBuilder)
        .mockReturnValueOnce(insertBuilder);

      const repo = new CustodyRepository(db as never);
      await repo.createEvent(baseInput);

      expect(insertBuilder.insert).toHaveBeenCalledWith(
        expect.objectContaining({ sequence: 4 }),
      );
    });

    it('passes optional fields as null when not provided', async () => {
      const maxBuilder = makeMaxBuilder(null);
      const insertBuilder = makeInsertBuilder(sampleRow);
      const db = jest.fn()
        .mockReturnValueOnce(maxBuilder)
        .mockReturnValueOnce(insertBuilder);

      const repo = new CustodyRepository(db as never);
      await repo.createEvent(baseInput);

      expect(insertBuilder.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          signature_url: null,
          photo_url: null,
          declared_value: null,
          notes: null,
          lat: null,
          lng: null,
        }),
      );
    });

    it('passes optional fields when provided', async () => {
      const maxBuilder = makeMaxBuilder(0);
      const insertBuilder = makeInsertBuilder({ ...sampleRow, signature_url: 'https://sig.url', declared_value: 500 });
      const db = jest.fn()
        .mockReturnValueOnce(maxBuilder)
        .mockReturnValueOnce(insertBuilder);

      const repo = new CustodyRepository(db as never);
      await repo.createEvent({
        ...baseInput,
        signatureUrl: 'https://sig.url',
        photoUrl: 'https://photo.url',
        declaredValue: 500,
        notes: 'Entrega completa',
        lat: 19.43,
        lng: -99.13,
      });

      expect(insertBuilder.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          signature_url: 'https://sig.url',
          photo_url: 'https://photo.url',
          declared_value: 500,
          notes: 'Entrega completa',
          lat: 19.43,
          lng: -99.13,
        }),
      );
    });
  });

  describe('getEventsByTrip()', () => {
    it('returns rows ordered by sequence asc', async () => {
      const rows = [
        { id: 'ev-1', sequence: 1, trip_id: 'trip-1' },
        { id: 'ev-2', sequence: 2, trip_id: 'trip-1' },
      ];
      const selectBuilder = makeSelectBuilder(rows);
      const db = jest.fn().mockReturnValue(selectBuilder);

      const repo = new CustodyRepository(db as never);
      const result = await repo.getEventsByTrip('trip-1');

      expect(result).toHaveLength(2);
      expect(selectBuilder.where).toHaveBeenCalledWith('custody_events.trip_id', 'trip-1');
    });

    it('returns empty array when no events', async () => {
      const selectBuilder = makeSelectBuilder([]);
      const db = jest.fn().mockReturnValue(selectBuilder);

      const repo = new CustodyRepository(db as never);
      const result = await repo.getEventsByTrip('trip-empty');

      expect(result).toHaveLength(0);
    });
  });
});
