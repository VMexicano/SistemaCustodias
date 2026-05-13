import type {
  INotificationChannel,
  NotificationPayload,
  NotificationType,
} from './notification.channel.interface.js';

// ---------------------------------------------------------------------------
// Notification content builders
// ---------------------------------------------------------------------------

function buildContent(
  type: NotificationType,
  data?: Record<string, string>,
): { title: string; body: string } {
  switch (type) {
    case 'trip_accepted':
      return {
        title: 'Conductor asignado',
        body: data?.driverName
          ? `${data.driverName} está en camino hacia ti`
          : 'Tu conductor está en camino',
      };
    case 'driver_arrived':
      return {
        title: 'Tu conductor llegó',
        body: 'Tu conductor te espera en el punto de encuentro',
      };
    case 'trip_started':
      return {
        title: 'Viaje en curso',
        body: '¡Tu viaje ha comenzado!',
      };
    case 'trip_completed':
      return {
        title: 'Viaje completado',
        body: data?.finalFare
          ? `Tu viaje terminó — $${data.finalFare} MXN`
          : 'Tu viaje ha terminado',
      };
    case 'payment_processed':
      return {
        title: 'Pago confirmado',
        body: data?.amount
          ? `Se cobró $${data.amount} MXN a tu tarjeta`
          : 'Tu pago fue procesado correctamente',
      };
    case 'payment_failed':
      return {
        title: 'Pago fallido',
        body: 'No pudimos cobrar tu tarjeta. Por favor verifica tu método de pago.',
      };
    case 'trip_reminder_24h':
      return {
        title: 'Recordatorio de viaje',
        body: data?.scheduledFor
          ? `Tu viaje está programado para mañana a las ${new Date(data.scheduledFor).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}`
          : 'Tu viaje programado es mañana',
      };
    case 'trip_reminder_1h':
      return {
        title: 'Tu viaje es pronto',
        body: 'Tu viaje programado comienza en aproximadamente 1 hora',
      };
    case 'trip_reminder_15m':
      return {
        title: '¡Tu viaje está por comenzar!',
        body: 'Tu viaje programado comienza en 15 minutos',
      };
    case 'scheduled_trip_searching':
      return {
        title: 'Buscando conductor',
        body: 'Estamos buscando un conductor para tu viaje programado',
      };
    case 'trip_scheduled_accepted':
      return {
        title: 'Viaje agendado aceptado',
        body: data?.scheduledFor
          ? `Viaje agendado — el pasajero debe salir a las ${new Date(data.scheduledFor).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Mexico_City' })}. Llega a tiempo.`
          : 'Aceptaste un viaje programado. Llega a tiempo.',
      };
  }
}

// ---------------------------------------------------------------------------
// NotificationService
// ---------------------------------------------------------------------------

export class NotificationService {
  constructor(private readonly channel: INotificationChannel) {}

  async send(
    recipientUserId: string,
    type: NotificationType,
    data?: Record<string, string>,
  ): Promise<void> {
    const { title, body } = buildContent(type, data);

    const payload: NotificationPayload = {
      recipientUserId,
      type,
      title,
      body,
      data,
    };

    await this.channel.send(payload);
  }
}
