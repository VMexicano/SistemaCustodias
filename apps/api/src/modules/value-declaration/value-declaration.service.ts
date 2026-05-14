import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { BusinessError } from '../../shared/errors/business-error.js';
import type { ValueDeclarationRepository } from './value-declaration.repository.js';
import type { Database } from '../../config/database.js';
import type {
  ValueDeclarationDTO,
  CustodyTypeDTO,
  UpsertDeclarationInput,
} from './value-declaration.types.js';

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);

function toDTO(row: {
  id: string;
  order_id: string;
  custody_type_id: string;
  declared_value: Record<string, unknown>;
  insurance_policy_id: string | null;
  verified_by: string | null;
  verified_at: Date | null;
  created_at: Date;
  updated_at: Date;
}): ValueDeclarationDTO {
  return {
    id: row.id,
    orderId: row.order_id,
    custodyTypeId: row.custody_type_id,
    declaredValue: row.declared_value,
    insurancePolicyId: row.insurance_policy_id,
    verifiedBy: row.verified_by,
    verifiedAt: row.verified_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

const DECLARABLE_STATUSES = new Set(['DRAFT', 'PENDING_APPROVAL']);

export class ValueDeclarationService {
  constructor(
    private readonly repo: ValueDeclarationRepository,
    private readonly db: Database,
  ) {}

  async listCustodyTypes(): Promise<CustodyTypeDTO[]> {
    const types = await this.repo.listActiveCustodyTypes();
    return types.map((t) => ({
      id: t.id,
      slug: t.slug,
      name: t.name,
      description: t.description,
      valueDeclarationSchema: t.value_declaration_schema,
    }));
  }

  async upsert(input: UpsertDeclarationInput): Promise<ValueDeclarationDTO> {
    return this.db.transaction(async (trx) => {
      // Lock the order and verify status
      const order = await trx('custody_orders')
        .where({ id: input.orderId })
        .whereNull('deleted_at')
        .forUpdate()
        .first() as { id: string; status: string; custody_type_id: string } | undefined;

      if (!order) {
        throw new BusinessError('ORDER_NOT_FOUND', 'Order not found');
      }

      if (!DECLARABLE_STATUSES.has(order.status)) {
        throw new BusinessError(
          'INVALID_ORDER_TRANSITION',
          `Cannot declare value when order is in status ${order.status}`,
        );
      }

      // Load the JSON Schema for this custody type
      const custodyType = await this.repo.findCustodyType(order.custody_type_id, trx);
      if (!custodyType) {
        throw new BusinessError('CUSTODY_TYPE_NOT_FOUND', 'Custody type not found or inactive');
      }

      // Validate declared_value against the JSON Schema
      const validate = ajv.compile(custodyType.value_declaration_schema);
      const valid = validate(input.declaredValue);
      if (!valid) {
        const details = validate.errors
          ?.map((e) => `${e.instancePath || 'value'} ${e.message}`)
          .join('; ');
        throw new BusinessError(
          'VALIDATION_ERROR',
          `declared_value does not match schema: ${details}`,
        );
      }

      const row = await this.repo.upsert(
        {
          orderId: input.orderId,
          custodyTypeId: order.custody_type_id,
          declaredValue: input.declaredValue,
          insurancePolicyId: input.insurancePolicyId,
        },
        trx,
      );

      return toDTO(row);
    });
  }

  async getByOrderId(orderId: string): Promise<ValueDeclarationDTO> {
    const row = await this.repo.findByOrderId(orderId);
    if (!row) {
      throw new BusinessError('VALUE_DECLARATION_NOT_FOUND', 'No declaration found for this order');
    }
    return toDTO(row);
  }
}
