import { BusinessError } from '../../shared/errors/business-error.js';
import type { ClientsRepository } from './clients.repository.js';
import type { Client, ClientDTO, CreateClientInput, UpdateClientInput } from './clients.types.js';

function toDTO(client: Client): ClientDTO {
  return {
    id: client.id,
    userId: client.user_id,
    companyId: client.company_id,
    companyName: client.company_name,
    rfc: client.rfc,
    contactName: client.contact_name,
    creditLimitMxn: Number(client.credit_limit_mxn),
    createdAt: client.created_at.toISOString(),
  };
}

export class ClientsService {
  constructor(private readonly repo: ClientsRepository) {}

  async create(input: CreateClientInput): Promise<ClientDTO> {
    const existing = await this.repo.findByUserId(input.userId);
    if (existing) {
      throw new BusinessError('CLIENT_ALREADY_EXISTS', 'A client profile already exists for this user');
    }

    const client = await this.repo.create({
      userId: input.userId,
      companyId: input.companyId,
      companyName: input.companyName,
      rfc: input.rfc,
      contactName: input.contactName,
      creditLimitMxn: input.creditLimitMxn,
    });

    return toDTO(client);
  }

  async getMe(userId: string): Promise<ClientDTO> {
    const client = await this.repo.findByUserId(userId);
    if (!client) {
      throw new BusinessError('CLIENT_NOT_FOUND', 'Client profile not found for this user');
    }
    return toDTO(client);
  }

  async getById(id: string): Promise<ClientDTO> {
    const client = await this.repo.findById(id);
    if (!client) {
      throw new BusinessError('CLIENT_NOT_FOUND', 'Client not found');
    }
    return toDTO(client);
  }

  async list(
    companyId: string,
    page: number,
    limit: number,
  ): Promise<{ data: ClientDTO[]; total: number }> {
    const result = await this.repo.findByCompany(companyId, page, limit);
    return { data: result.data.map(toDTO), total: result.total };
  }

  async update(id: string, input: UpdateClientInput): Promise<ClientDTO> {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new BusinessError('CLIENT_NOT_FOUND', 'Client not found');
    }

    const client = await this.repo.update(id, {
      companyName: input.companyName,
      rfc: input.rfc,
      contactName: input.contactName,
      creditLimitMxn: input.creditLimitMxn,
    });

    return toDTO(client);
  }

  async remove(id: string): Promise<void> {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new BusinessError('CLIENT_NOT_FOUND', 'Client not found');
    }
    await this.repo.softDelete(id);
  }
}
