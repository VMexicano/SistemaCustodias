# Snapshot — Módulo: notifications
> Última actualización: 2026-04-07 | Estado: ✅ Sprint 5 completo

## Estado
- Implementación: 100%
- Tests: ✅ 100% lines / 83% branches (umbral: ≥75%) — 14 tests
- Integrado en app.ts: ✅

## Responsabilidad
Push notifications via canal abstracto (ADR-028). LogChannel en dev/test, FCMChannel en prod.
Sin SMS/Twilio en Sprint 5 (descoped).

## Decisiones Sprint 5 (ADR-028)
- `INotificationChannel` abstracta — mismo patrón que OTPChannelService (ADR-018)
- `NOTIFICATION_PROVIDER=log` → LogNotificationChannel (imprime en consola)
- `NOTIFICATION_PROVIDER=fcm` → FCMNotificationChannel (firebase-admin SDK)
- Sin fallback SMS — Twilio descoped Sprint 5, se evalúa Sprint 6+
- FCM tokens de dispositivo: se registran en Sprint 7 (mobile) — FCMChannel maneja gracefully token-not-found

## Tipos de notificación Sprint 5
```
trip_accepted      → pasajero
driver_arrived     → pasajero
trip_completed     → pasajero + conductor
payment_processed  → pasajero
payment_failed     → pasajero
```

## Circuit breaker (opossum) — ADR-027
FCM: timeout 5s, threshold 50%, reset 30s

## Variables de entorno
```
NOTIFICATION_PROVIDER=log   # dev/test (sin credenciales Firebase)
NOTIFICATION_PROVIDER=fcm   # prod
FCM_PROJECT_ID=             # solo cuando NOTIFICATION_PROVIDER=fcm
FCM_CLIENT_EMAIL=
FCM_PRIVATE_KEY=
```

## Archivos implementados
```
apps/api/src/modules/notifications/
├── notification.service.ts
├── notification.worker.ts
├── notification.channel.interface.ts   ← INotificationChannel
├── log.notification.channel.ts
└── fcm.notification.channel.ts
```

## Spec
- `spec/sprint5/requirements.md` — RF-504, RF-505
- `spec/sprint5/design.md` — INotificationChannel, FCMChannel, LogChannel
- `spec/sprint5/tasks.md` — NOTIF-001, NOTIF-002
