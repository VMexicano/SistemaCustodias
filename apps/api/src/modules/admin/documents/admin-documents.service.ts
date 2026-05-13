import { BusinessError } from '../../../shared/errors/business-error.js';
import type { Database } from '../../../config/database.js';
import type { DriversRepository } from '../../drivers/drivers.repository.js';
import type { DocumentsRepository } from '../../drivers/documents/documents.repository.js';
import type { DriverDocumentDTO } from '../../drivers/drivers.types.js';

export interface ReviewDocumentInput {
  status: 'approved' | 'rejected';
  rejectionReason?: string;
}

export class AdminDocumentsService {
  constructor(
    private readonly documentsRepo: DocumentsRepository,
    private readonly driversRepo: DriversRepository,
    private readonly db: Database,
  ) {}

  async reviewDocument(
    adminId: string,
    documentId: string,
    input: ReviewDocumentInput,
  ): Promise<DriverDocumentDTO> {
    if (input.status === 'rejected' && !input.rejectionReason?.trim()) {
      throw new BusinessError('VALIDATION_ERROR', 'rejectionReason is required when rejecting a document');
    }

    const doc = await this.documentsRepo.findById(documentId);
    if (!doc) {
      throw new BusinessError('DOCUMENT_NOT_FOUND', 'Document not found');
    }

    const updated = await this.documentsRepo.update(documentId, {
      status: input.status,
      rejection_reason: input.status === 'rejected' ? (input.rejectionReason ?? null) : null,
      reviewed_at: new Date(),
      reviewed_by: adminId,
    });

    await this.db('audit_logs').insert({
      entity_type: 'driver_document',
      entity_id: documentId,
      action: 'review',
      actor_type: 'admin',
      actor_id: adminId,
      new_value: JSON.stringify({ status: input.status, rejectionReason: input.rejectionReason }),
    });

    // R-DRV-003: auto-approve driver when all required docs are approved
    if (input.status === 'approved') {
      await this.checkAndAutoApproveDriver(doc.driver_id, adminId);
    }

    // Resolve requirement name for the DTO
    const requirement = await this.documentsRepo.findRequirementById(doc.requirement_id);

    return {
      id: updated.id,
      requirementId: updated.requirement_id,
      requirementCode: requirement?.code ?? '',
      requirementName: requirement?.name ?? '',
      fileUrl: updated.file_url,
      status: updated.status,
      expiresAt: updated.expires_at ? updated.expires_at.toISOString() : null,
      rejectionReason: updated.rejection_reason,
      reviewedAt: updated.reviewed_at ? updated.reviewed_at.toISOString() : null,
    };
  }

  /**
   * R-DRV-003: If all required docs are approved, set driver status to 'approved'.
   */
  private async checkAndAutoApproveDriver(driverId: string, adminId: string): Promise<void> {
    const driver = await this.driversRepo.findById(driverId);
    if (!driver || driver.status === 'approved') return;

    const { total, approved } = await this.documentsRepo.countRequiredApproved(
      driverId,
      driver.region_id,
    );

    if (total > 0 && total === approved) {
      await this.driversRepo.setStatus(driverId, 'approved');

      await this.db('audit_logs').insert({
        entity_type: 'driver',
        entity_id: driverId,
        action: 'auto_approve',
        actor_type: 'system',
        actor_id: adminId,
        new_value: JSON.stringify({ status: 'approved', reason: 'all_required_documents_approved' }),
      });
    }
  }
}
