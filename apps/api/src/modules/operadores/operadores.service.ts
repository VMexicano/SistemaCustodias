import { BusinessError } from '../../shared/errors/business-error.js';
import type { OperadoresRepository } from './operadores.repository.js';
import type {
  Operator,
  OperatorDTO,
  OperatorType,
  OperatorStatus,
  CreateOperatorInput,
  UpdateStatusInput,
  SuspendOperatorInput,
} from './operadores.types.js';

function toDTO(op: Operator): OperatorDTO {
  return {
    id: op.id,
    userId: op.user_id,
    vehicleId: op.vehicle_id,
    operatorType: op.operator_type,
    licenseNumber: op.license_number,
    certifications: op.certifications,
    status: op.status,
    createdAt: op.created_at.toISOString(),
  };
}

export class OperadoresService {
  constructor(private readonly repo: OperadoresRepository) {}

  async create(input: CreateOperatorInput): Promise<OperatorDTO> {
    const existing = await this.repo.findByUserId(input.userId);
    if (existing) {
      throw new BusinessError('OPERATOR_ALREADY_EXISTS', 'An operator profile already exists for this user');
    }

    const validTypes: OperatorType[] = ['custodio', 'copiloto'];
    if (!validTypes.includes(input.operatorType)) {
      throw new BusinessError('INVALID_OPERATOR_TYPE', `operator_type must be one of: ${validTypes.join(', ')}`);
    }

    const operator = await this.repo.create({
      userId: input.userId,
      operatorType: input.operatorType,
      licenseNumber: input.licenseNumber,
      certifications: input.certifications,
    });

    return toDTO(operator);
  }

  async getById(id: string): Promise<OperatorDTO> {
    const op = await this.repo.findById(id);
    if (!op) {
      throw new BusinessError('OPERATOR_NOT_FOUND', 'Operator not found');
    }
    return toDTO(op);
  }

  async listAvailable(tenantId: string, operatorType?: OperatorType): Promise<OperatorDTO[]> {
    const operators = await this.repo.findAvailable(tenantId, operatorType);
    return operators.map(toDTO);
  }

  async list(
    tenantId: string,
    filters: { operator_type?: OperatorType; status?: string },
    page: number,
    limit: number,
  ): Promise<{ data: OperatorDTO[]; total: number }> {
    const result = await this.repo.findByTenant(
      tenantId,
      {
        operator_type: filters.operator_type,
        status: filters.status as OperatorStatus | undefined,
      },
      page,
      limit,
    );
    return { data: result.data.map(toDTO), total: result.total };
  }

  async updateStatus(id: string, input: UpdateStatusInput): Promise<OperatorDTO> {
    const op = await this.repo.findById(id);
    if (!op) {
      throw new BusinessError('OPERATOR_NOT_FOUND', 'Operator not found');
    }
    if (op.status === 'suspended') {
      throw new BusinessError('OPERATOR_SUSPENDED', 'Cannot change status of a suspended operator');
    }

    const updated = await this.repo.updateStatus(id, input.status);
    return toDTO(updated);
  }

  async suspend(id: string, _input: SuspendOperatorInput): Promise<OperatorDTO> {
    const op = await this.repo.findById(id);
    if (!op) {
      throw new BusinessError('OPERATOR_NOT_FOUND', 'Operator not found');
    }
    if (op.status === 'busy') {
      throw new BusinessError('OPERATOR_ON_ACTIVE_ORDER', 'Cannot suspend an operator with an active order');
    }

    const updated = await this.repo.updateStatus(id, 'suspended');
    return toDTO(updated);
  }

  async remove(id: string): Promise<void> {
    const op = await this.repo.findById(id);
    if (!op) {
      throw new BusinessError('OPERATOR_NOT_FOUND', 'Operator not found');
    }
    await this.repo.softDelete(id);
  }
}
