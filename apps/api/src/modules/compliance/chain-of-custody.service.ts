import crypto, { randomUUID } from 'node:crypto';
import PDFDocument from 'pdfkit';
import { BusinessError } from '../../shared/errors/business-error.js';
import type { ComplianceRepository } from './compliance.repository.js';
import type { ChainOfCustodyReport, TransitionRecord, AlertRecord, SignatureRecord } from './compliance.types.js';

function parsePoint(pgPoint: string | null): { lat: number; lng: number } | null {
  if (!pgPoint) return null;
  const match = pgPoint.match(/\(([^,]+),([^)]+)\)/);
  if (!match) return null;
  return { lat: parseFloat(match[2]!), lng: parseFloat(match[1]!) };
}

export class ChainOfCustodyService {
  constructor(private readonly repo: ComplianceRepository) {}

  async buildReport(orderId: string, actorRole: string): Promise<ChainOfCustodyReport> {
    const order = await this.repo.getOrderWithType(orderId);
    if (!order) throw new BusinessError('ORDER_NOT_FOUND');

    const [client, transitions, valueDeclaration, alerts] = await Promise.all([
      this.repo.getClientForOrder(order.client_id),
      this.repo.getTransitionsWithActors(orderId),
      this.repo.getValueDeclaration(orderId),
      this.repo.getAlerts(orderId),
    ]);

    const custodioData = order.custodio_id
      ? await this.repo.getOperatorData(order.custodio_id)
      : null;

    const copilotoData = order.copiloto_id
      ? await this.repo.getOperatorData(order.copiloto_id)
      : null;

    const completedTransition = transitions.find((t) => t.to_status === 'COMPLETED');

    const transitionRecords: TransitionRecord[] = transitions.map((t) => ({
      id: t.id,
      fromStatus: t.from_status,
      toStatus: t.to_status,
      actor: {
        id: t.actor_id,
        role: t.actor_role,
        name:
          t.actor_first_name != null && t.actor_last_name != null
            ? `${t.actor_first_name} ${t.actor_last_name}`.trim()
            : null,
      },
      location: parsePoint(t.location),
      notes: t.notes,
      hasSignature: t.digital_signature !== null,
      signatureData: actorRole === 'client' ? null : t.digital_signature,
      createdAt: t.created_at.toISOString(),
    }));

    const alertRecords: AlertRecord[] = alerts.map((a) => ({
      id: a.id,
      alertType: a.alert_type,
      severity: a.severity,
      description: a.description,
      resolvedAt: a.resolved_at ? a.resolved_at.toISOString() : null,
      createdAt: a.created_at.toISOString(),
    }));

    const reportContent = {
      reportId: randomUUID(),
      generatedAt: new Date().toISOString(),
      order: {
        id: order.id,
        orderNumber: order.order_number,
        status: order.status,
        custodyType: order.custody_type_name,
        custodyTypeSlug: order.custody_type_slug,
        pickupAddress: order.pickup_address,
        deliveryAddress: order.delivery_address,
        notes: order.notes,
        createdAt: order.created_at.toISOString(),
        completedAt: completedTransition ? completedTransition.created_at.toISOString() : null,
      },
      client: {
        id: client?.id ?? '',
        name: client?.contact_name ?? '',
        companyName: client?.company_name ?? null,
        rfc: client?.rfc ?? null,
      },
      team: {
        custodio: custodioData
          ? {
              id: custodioData.operator_id,
              name: `${custodioData.first_name ?? ''} ${custodioData.last_name ?? ''}`.trim(),
              licenseNumber: custodioData.license_number,
            }
          : null,
        copiloto: copilotoData
          ? {
              id: copilotoData.operator_id,
              name: `${copilotoData.first_name ?? ''} ${copilotoData.last_name ?? ''}`.trim(),
              licenseNumber: copilotoData.license_number,
            }
          : null,
        vehicle:
          custodioData?.vehicle_id
            ? {
                id: custodioData.vehicle_id,
                plate: custodioData.vehicle_plate ?? '',
                make: custodioData.vehicle_make ?? null,
                model: custodioData.vehicle_model ?? '',
                year: custodioData.vehicle_year ?? 0,
              }
            : null,
      },
      valueDeclaration: valueDeclaration
        ? {
            custodyType: valueDeclaration.custody_type_name,
            declaredValue:
              actorRole === 'client'
                ? null
                : (valueDeclaration.declared_value as Record<string, unknown>),
            insurancePolicyId: valueDeclaration.insurance_policy_id,
            verifiedAt: valueDeclaration.verified_at
              ? valueDeclaration.verified_at.toISOString()
              : null,
            verifiedBy: valueDeclaration.verified_by_name,
          }
        : null,
      transitions: transitionRecords,
      alerts: alertRecords,
    };

    const hash = crypto
      .createHash('sha256')
      .update(JSON.stringify(reportContent))
      .digest('hex');

    return { ...reportContent, integrity: { hash, algorithm: 'sha256' as const } };
  }

  async getSignatures(orderId: string): Promise<SignatureRecord[]> {
    const order = await this.repo.getOrderWithType(orderId);
    if (!order) throw new BusinessError('ORDER_NOT_FOUND');

    const transitions = await this.repo.getTransitionsWithActors(orderId);

    return transitions
      .filter((t) => t.digital_signature !== null)
      .map((t) => ({
        id: t.id,
        fromStatus: t.from_status,
        toStatus: t.to_status,
        actor: {
          id: t.actor_id,
          role: t.actor_role,
          name:
            t.actor_first_name != null && t.actor_last_name != null
              ? `${t.actor_first_name} ${t.actor_last_name}`.trim()
              : null,
        },
        signatureData: t.digital_signature!,
        createdAt: t.created_at.toISOString(),
      }));
  }

  async buildPdf(orderId: string, actorRole: string): Promise<Buffer> {
    const report = await this.buildReport(orderId, actorRole);
    return this.renderToPdf(report);
  }

  async renderToPdf(report: ChainOfCustodyReport): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.fontSize(18).font('Helvetica-Bold').text('Reporte de Cadena de Custodia', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(10).font('Helvetica').text(`Generado: ${report.generatedAt}`, { align: 'center' });
      doc.moveDown(0.3);
      doc.fontSize(9).text(`SHA-256: ${report.integrity.hash}`, { align: 'center' });
      doc.moveDown(1);

      doc.fontSize(13).font('Helvetica-Bold').text('Datos de la Orden');
      doc.fontSize(10).font('Helvetica');
      doc.text(`Número: ${report.order.orderNumber}`);
      doc.text(`Estado: ${report.order.status}`);
      doc.text(`Tipo de Custodia: ${report.order.custodyType}`);
      doc.text(`Creada: ${report.order.createdAt}`);
      if (report.order.completedAt) doc.text(`Completada: ${report.order.completedAt}`);
      doc.moveDown(0.5);

      doc.fontSize(13).font('Helvetica-Bold').text('Cliente');
      doc.fontSize(10).font('Helvetica');
      doc.text(`Nombre: ${report.client.name}`);
      if (report.client.companyName) doc.text(`Empresa: ${report.client.companyName}`);
      if (report.client.rfc) doc.text(`RFC: ${report.client.rfc}`);
      doc.moveDown(0.5);

      doc.fontSize(13).font('Helvetica-Bold').text('Equipo de Custodia');
      doc.fontSize(10).font('Helvetica');
      if (report.team.custodio) {
        doc.text(`Custodio: ${report.team.custodio.name}`);
        if (report.team.custodio.licenseNumber) {
          doc.text(`  Licencia: ${report.team.custodio.licenseNumber}`);
        }
      }
      if (report.team.copiloto) {
        doc.text(`Copiloto: ${report.team.copiloto.name}`);
        if (report.team.copiloto.licenseNumber) {
          doc.text(`  Licencia: ${report.team.copiloto.licenseNumber}`);
        }
      }
      if (report.team.vehicle) {
        const v = report.team.vehicle;
        doc.text(`Vehículo: ${v.plate} — ${v.make ?? ''} ${v.model} (${v.year})`);
      }
      doc.moveDown(0.5);

      doc.fontSize(13).font('Helvetica-Bold').text('Cronología de Transiciones');
      doc.fontSize(10).font('Helvetica');
      for (const t of report.transitions) {
        doc.text(`${t.createdAt}  ${t.fromStatus} → ${t.toStatus}`);
        const actorName = t.actor.name ?? t.actor.role ?? 'Sistema';
        doc.text(`  Actor: ${actorName}`);
        if (t.hasSignature) doc.text('  [Firma digital capturada]');
        if (t.notes) doc.text(`  Notas: ${t.notes}`);
      }
      doc.moveDown(0.5);

      if (report.alerts.length > 0) {
        doc.fontSize(13).font('Helvetica-Bold').text('Alertas de Seguridad');
        doc.fontSize(10).font('Helvetica');
        for (const a of report.alerts) {
          doc.text(`${a.createdAt}  ${a.alertType} [${a.severity}]`);
          if (a.description) doc.text(`  ${a.description}`);
          if (a.resolvedAt) doc.text(`  Resuelta: ${a.resolvedAt}`);
        }
        doc.moveDown(0.5);
      }

      doc.end();
    });
  }
}
