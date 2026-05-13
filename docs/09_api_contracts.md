# API Contracts — Contratos de la API v1

> Documento de referencia para equipos de mobile, web y backend.
> Toda integración debe seguir estos contratos exactamente.
>
> **Base URL:** `https://api.tudominio.com/api/v1`
> **Versión:** v1
> **Autenticación:** Bearer token JWT en header `Authorization`

---

## Índice

1. [Estructura de respuesta estándar](#1-estructura-de-respuesta-estándar)
2. [Códigos de error](#2-códigos-de-error)
3. [Auth](#3-auth)
4. [Users](#4-users)
5. [Drivers](#5-drivers)
6. [Trips](#6-trips)
7. [Admin](#7-admin)
8. [WebSocket Events](#8-websocket-events)
9. [Rate Limits](#9-rate-limits)
10. [Changelog](#10-changelog)

---

## 1. Estructura de Respuesta Estándar

Toda respuesta de la API sigue esta estructura sin excepción.

### Éxito — objeto único
```json
{
  "success": true,
  "data": {
    "trip": { }
  }
}
```

### Éxito — lista paginada
```json
{
  "success": true,
  "data": {
    "trips": [ ]
  },
  "meta": {
    "total":    150,
    "page":     1,
    "per_page": 20,
    "pages":    8
  }
}
```

### Error
```json
{
  "success":    false,
  "error": {
    "code":     "TRIP_002",
    "message":  "No es posible cancelar un viaje completado",
    "details":  { }
  },
  "request_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

---

## 2. Códigos de Error

### Auth
| Código | HTTP | Descripción |
|---|---|---|
| `AUTH_001` | 401 | Token no proporcionado o inválido |
| `AUTH_002` | 401 | Token expirado |
| `AUTH_003` | 403 | Sin permisos para este recurso |
| `AUTH_004` | 400 | OTP inválido |
| `AUTH_005` | 429 | Demasiados intentos de OTP |

### Viajes
| Código | HTTP | Descripción |
|---|---|---|
| `TRIP_001` | 404 | Viaje no encontrado |
| `TRIP_002` | 400 | Transición de estado no permitida |
| `TRIP_003` | 400 | El pasajero ya tiene un viaje activo |
| `TRIP_004` | 400 | No hay conductores disponibles en la zona |
| `TRIP_005` | 400 | El conductor ya tiene un viaje activo |

### Pagos
| Código | HTTP | Descripción |
|---|---|---|
| `PAY_001` | 400 | Se requiere método de pago válido |
| `PAY_002` | 400 | Pago rechazado por el banco |
| `PAY_003` | 400 | El pago ya fue procesado |
| `PAY_004` | 400 | Método de pago no encontrado |

### Conductores
| Código | HTTP | Descripción |
|---|---|---|
| `DRV_001` | 400 | Cuenta de conductor no aprobada |
| `DRV_002` | 400 | Documentos vencidos o rechazados |
| `DRV_003` | 400 | El conductor ya está en línea |
| `DRV_004` | 400 | Vehículo no encontrado o no aprobado |

### Validación y general
| Código | HTTP | Descripción |
|---|---|---|
| `VAL_001` | 422 | Error de validación — ver `details` |
| `VAL_002` | 404 | Recurso no encontrado |
| `SVC_001` | 503 | Servicio externo no disponible temporalmente |
| `SRV_001` | 500 | Error interno — el equipo fue notificado |

---

## 3. Auth

### POST /auth/register

Registra un nuevo usuario y envía OTP al teléfono.

**No requiere autenticación.**

**Request**
```json
{
  "phone":     "+521234567890",
  "full_name": "Ana García",
  "email":     "ana@email.com",
  "role":      "passenger"
}
```

| Campo | Tipo | Requerido | Validación |
|---|---|---|---|
| `phone` | string | ✓ | Formato E.164: +52XXXXXXXXXX |
| `full_name` | string | ✓ | 3-255 caracteres |
| `email` | string | — | Email válido si se proporciona |
| `role` | string | ✓ | `passenger` o `driver` |

**Response 201**
```json
{
  "success": true,
  "data": {
    "message": "OTP enviado a +521234567890",
    "expires_in": 300
  }
}
```

**Errores posibles:** `VAL_001`, `AUTH_005`

---

### POST /auth/verify-phone

Verifica el OTP y retorna tokens de acceso.

**Request**
```json
{
  "phone": "+521234567890",
  "otp":   "123456"
}
```

**Response 200**
```json
{
  "success": true,
  "data": {
    "access_token":  "eyJhbGciOiJIUzI1NiJ9...",
    "refresh_token": "eyJhbGciOiJIUzI1NiJ9...",
    "expires_in":    900,
    "user": {
      "id":       "550e8400-e29b-41d4-a716-446655440000",
      "phone":    "+521234567890",
      "full_name": "Ana García",
      "roles":    ["passenger"],
      "verified": true
    }
  }
}
```

**Errores posibles:** `AUTH_004`, `AUTH_005`

---

### POST /auth/login

Login con teléfono y contraseña (usuarios que configuraron contraseña).

**Request**
```json
{
  "phone":    "+521234567890",
  "password": "MiContraseña123"
}
```

**Response 200** — mismo formato que `/auth/verify-phone`

**Errores posibles:** `AUTH_001`, `VAL_001`

---

### POST /auth/refresh

Renueva el access token. El refresh token rota en cada llamada.

**Request**
```json
{
  "refresh_token": "eyJhbGciOiJIUzI1NiJ9..."
}
```

**Response 200**
```json
{
  "success": true,
  "data": {
    "access_token":  "eyJhbGciOiJIUzI1NiJ9...",
    "refresh_token": "eyJhbGciOiJIUzI1NiJ9...",
    "expires_in":    900
  }
}
```

**Errores posibles:** `AUTH_001`, `AUTH_002`

---

### POST /auth/logout

Invalida el refresh token actual.

**Requiere:** Bearer token

**Request** — body vacío

**Response 200**
```json
{
  "success": true,
  "data": { "message": "Sesión cerrada correctamente" }
}
```

---

## 4. Users

### GET /users/me

Retorna el perfil completo del usuario autenticado.

**Requiere:** Bearer token (cualquier rol)

**Response 200**
```json
{
  "success": true,
  "data": {
    "user": {
      "id":         "550e8400-e29b-41d4-a716-446655440000",
      "phone":      "+521234567890",
      "full_name":  "Ana García",
      "email":      "ana@email.com",
      "avatar_url": "https://cdn.tudominio.com/avatars/ana.jpg",
      "rating":     4.87,
      "total_trips": 23,
      "roles":      ["passenger"],
      "created_at": "2024-01-15T10:30:00Z",
      "payment_methods": [
        {
          "id":         "pm_550e8400",
          "brand":      "visa",
          "last_four":  "4242",
          "exp_month":  12,
          "exp_year":   2026,
          "is_default": true
        }
      ]
    }
  }
}
```

---

### PATCH /users/me

Actualiza el perfil del usuario.

**Request**
```json
{
  "full_name":  "Ana García López",
  "email":      "ana.nueva@email.com",
  "avatar_url": "https://cdn.tudominio.com/avatars/nueva.jpg"
}
```

Todos los campos son opcionales. Solo se actualizan los proporcionados.

**Response 200**
```json
{
  "success": true,
  "data": {
    "user": { }
  }
}
```

---

### POST /users/me/payment-methods

Guarda un método de pago. Requiere un `payment_method_id` generado previamente por Stripe.js en el cliente.

**Request**
```json
{
  "provider_method_id": "pm_1234567890abcdef"
}
```

**Response 201**
```json
{
  "success": true,
  "data": {
    "payment_method": {
      "id":         "550e8400-e29b-41d4-a716-446655440001",
      "brand":      "mastercard",
      "last_four":  "5555",
      "exp_month":  8,
      "exp_year":   2027,
      "is_default": false
    }
  }
}
```

**Errores posibles:** `PAY_001`, `PAY_002`

---

### DELETE /users/me/payment-methods/:id

Elimina un método de pago guardado.

**Response 200**
```json
{
  "success": true,
  "data": { "message": "Método de pago eliminado" }
}
```

**Errores posibles:** `PAY_004`

---

### PATCH /users/me/payment-methods/:id/default

Establece un método de pago como predeterminado.

**Request** — body vacío

**Response 200**
```json
{
  "success": true,
  "data": {
    "payment_method": {
      "id":         "550e8400-...",
      "is_default": true
    }
  }
}
```

---

## 5. Drivers

### GET /drivers/me

Retorna el perfil completo del conductor autenticado.

**Requiere:** Bearer token (rol `driver`)

**Response 200**
```json
{
  "success": true,
  "data": {
    "driver": {
      "id":             "660e8400-e29b-41d4-a716-446655440000",
      "user_id":        "550e8400-...",
      "full_name":      "Carlos Mendoza",
      "phone":          "+521234567891",
      "rating":         4.92,
      "total_trips":    145,
      "status":         "approved",
      "online":         false,
      "license_number": "MECC850101",
      "license_expiry": "2026-03-15",
      "documents": [
        {
          "id":              "770e8400-...",
          "requirement_id":  "doc_license",
          "requirement_name":"Licencia de conducir",
          "status":          "approved",
          "expires_at":      "2026-03-15",
          "url":             "https://cdn.tudominio.com/docs/lic.jpg"
        }
      ],
      "active_vehicle": {
        "id":     "880e8400-...",
        "brand":  "Toyota",
        "model":  "Corolla",
        "year":   2021,
        "plate":  "ABC-1234",
        "color":  "Blanco"
      }
    }
  }
}
```

---

### POST /drivers/me/go-online

Pone al conductor en línea y disponible para recibir viajes.

**Request**
```json
{
  "vehicle_id": "880e8400-e29b-41d4-a716-446655440000",
  "location": {
    "lat": 19.4326,
    "lng": -99.1332
  }
}
```

**Response 200**
```json
{
  "success": true,
  "data": {
    "online":  true,
    "vehicle": {
      "id":    "880e8400-...",
      "brand": "Toyota",
      "model": "Corolla",
      "plate": "ABC-1234"
    }
  }
}
```

**Errores posibles:** `DRV_001`, `DRV_002`, `DRV_003`, `DRV_004`

---

### POST /drivers/me/go-offline

Pone al conductor fuera de línea.

**Request** — body vacío

**Response 200**
```json
{
  "success": true,
  "data": { "online": false }
}
```

---

### PATCH /drivers/me/location

Actualiza la posición del conductor. Solo escribe en Redis. Debe llamarse cada 3-5 segundos cuando el conductor está online.

**Request**
```json
{
  "lat":      19.4326,
  "lng":      -99.1332,
  "heading":  180.5,
  "speed":    35.2,
  "accuracy": 5.0
}
```

**Response 200**
```json
{
  "success": true,
  "data": { "received": true }
}
```

> **Nota de performance:** Este endpoint tiene un objetivo de latencia < 50ms. No toca PostgreSQL. No incluir lógica adicional en este endpoint.

---

### POST /drivers/me/documents

Sube un documento al perfil del conductor.

**Content-Type:** `multipart/form-data`

**Request**
```
requirement_id: "doc_license"
file: [archivo binario, max 5MB, jpg/png/pdf]
expires_at: "2026-03-15"  (opcional, si el documento vence)
```

**Response 201**
```json
{
  "success": true,
  "data": {
    "document": {
      "id":              "770e8400-...",
      "requirement_id":  "doc_license",
      "requirement_name":"Licencia de conducir",
      "status":          "pending",
      "expires_at":      "2026-03-15",
      "url":             "https://cdn.tudominio.com/docs/lic.jpg",
      "created_at":      "2024-01-15T10:30:00Z"
    }
  }
}
```

---

### GET /drivers/me/earnings

Retorna el resumen de ganancias del conductor.

**Query params**
| Param | Tipo | Default | Descripción |
|---|---|---|---|
| `from` | date | inicio del mes | ISO date: `2024-01-01` |
| `to` | date | hoy | ISO date: `2024-01-31` |
| `page` | number | 1 | Página |
| `per_page` | number | 20 | Items por página |

**Response 200**
```json
{
  "success": true,
  "data": {
    "summary": {
      "total_earnings":  1250.50,
      "platform_fees":   250.10,
      "net_earnings":    1000.40,
      "total_trips":     28,
      "avg_per_trip":    35.73
    },
    "trips": [
      {
        "id":           "trip_001",
        "completed_at": "2024-01-15T14:30:00Z",
        "fare":         98.83,
        "earnings":     79.06,
        "origin":       "Col. Narvarte",
        "destination":  "Pedregal de Carrasco"
      }
    ]
  },
  "meta": {
    "total": 28, "page": 1, "per_page": 20, "pages": 2
  }
}
```

---

## 6. Trips

### POST /trips/estimate

Cotiza un viaje **antes** de crearlo. El pasajero ve las opciones y el precio antes de confirmar.

**Requiere:** Bearer token (rol `passenger`)

**Request**
```json
{
  "origin": {
    "lat":     19.4326,
    "lng":     -99.1332,
    "address": "Insurgentes Sur 1234, Col. Narvarte, CDMX"
  },
  "destination": {
    "lat":     19.4284,
    "lng":     -99.1277,
    "address": "Zócalo, Centro Histórico, CDMX"
  },
  "scheduled_at": null
}
```

| Campo | Tipo | Requerido | Notas |
|---|---|---|---|
| `origin.lat` | number | ✓ | -90 a 90 |
| `origin.lng` | number | ✓ | -180 a 180 |
| `origin.address` | string | ✓ | Dirección legible |
| `destination.*` | object | ✓ | Misma estructura que origin |
| `scheduled_at` | string\|null | — | ISO datetime o null para viaje inmediato |

**Response 200**
```json
{
  "success": true,
  "data": {
    "options": [
      {
        "trip_type_id":       "tt_basic_mx",
        "name":               "Basic",
        "description":        "Vehículo estándar",
        "estimated_fare":     98.83,
        "currency":           "MXN",
        "is_estimate":        false,
        "disclaimer":         null,
        "breakdown": {
          "base_fare":        30.00,
          "distance_fare":    32.50,
          "time_fare":        10.00,
          "applied_factors": [
            {
              "code":   "night_service",
              "name":   "Servicio nocturno",
              "type":   "multiplier",
              "value":  1.30,
              "impact": 18.33
            }
          ],
          "subtotal":         90.83,
          "tax_amount":       8.00,
          "total":            98.83
        },
        "estimated_distance": 3.2,
        "estimated_duration": 18,
        "drivers_nearby":     4
      },
      {
        "trip_type_id": "tt_plus_mx",
        "name":         "Plus",
        "estimated_fare": 125.50
      },
      {
        "trip_type_id": "tt_premium_mx",
        "name":         "Premium",
        "estimated_fare": 180.00
      }
    ]
  }
}
```

> **Nota:** Si Google Maps no está disponible, `is_estimate: true` y `disclaimer` contiene un mensaje para mostrar al usuario.

---

### POST /trips

Crea y solicita un viaje.

**Requiere:** Bearer token (rol `passenger`)

**Request**
```json
{
  "trip_type_id":      "tt_basic_mx",
  "origin": {
    "lat":     19.4326,
    "lng":     -99.1332,
    "address": "Insurgentes Sur 1234, Col. Narvarte, CDMX"
  },
  "destination": {
    "lat":     19.4284,
    "lng":     -99.1277,
    "address": "Zócalo, Centro Histórico, CDMX"
  },
  "payment_method_id": "550e8400-e29b-41d4-a716-446655440001",
  "scheduled_at":      null,
  "notes":             "Por favor espérame en la entrada principal"
}
```

**Response 201**
```json
{
  "success": true,
  "data": {
    "trip": {
      "id":               "trip_550e8400",
      "status":           "searching",
      "trip_type": {
        "id":   "tt_basic_mx",
        "name": "Basic"
      },
      "origin": {
        "lat":     19.4326,
        "lng":     -99.1332,
        "address": "Insurgentes Sur 1234, Col. Narvarte, CDMX"
      },
      "destination": {
        "lat":     19.4284,
        "lng":     -99.1277,
        "address": "Zócalo, Centro Histórico, CDMX"
      },
      "estimated_fare":     98.83,
      "estimated_duration": 18,
      "scheduled_at":       null,
      "created_at":         "2024-01-15T23:00:00Z"
    }
  }
}
```

**Errores posibles:** `TRIP_003`, `PAY_001`, `PAY_004`

---

### GET /trips/:id

Retorna el estado actual del viaje.

**Requiere:** Bearer token (pasajero del viaje o conductor asignado)

**Response 200**
```json
{
  "success": true,
  "data": {
    "trip": {
      "id":     "trip_550e8400",
      "status": "driver_en_route",
      "driver": {
        "id":         "660e8400-...",
        "full_name":  "Carlos Mendoza",
        "phone":      "+521234567891",
        "rating":     4.92,
        "avatar_url": "https://cdn.tudominio.com/avatars/carlos.jpg",
        "vehicle": {
          "brand":  "Toyota",
          "model":  "Corolla",
          "year":   2021,
          "plate":  "ABC-1234",
          "color":  "Blanco"
        },
        "location": {
          "lat":         19.4350,
          "lng":         -99.1400,
          "heading":     180.5,
          "eta_seconds": 240
        }
      },
      "estimated_fare": 98.83,
      "actual_fare":    null,
      "started_at":     null,
      "completed_at":   null,
      "created_at":     "2024-01-15T23:00:00Z"
    }
  }
}
```

> **Nota:** `driver.location` solo se incluye cuando `status` es `accepted`, `driver_en_route` o `driver_arrived`. `actual_fare` solo se incluye cuando `status` es `completed`.

---

### DELETE /trips/:id

Cancela un viaje. Solo puede hacerlo el pasajero.

**Requiere:** Bearer token (rol `passenger`, debe ser el pasajero del viaje)

**Request**
```json
{
  "reason": "Me equivoqué de destino"
}
```

**Response 200**
```json
{
  "success": true,
  "data": {
    "trip": {
      "id":            "trip_550e8400",
      "status":        "cancelled_by_passenger",
      "cancelled_at":  "2024-01-15T23:05:00Z",
      "cancellation_fee": 0.00
    }
  }
}
```

> **Nota:** `cancellation_fee > 0` cuando el conductor ya estaba en camino y se superó el tiempo de cancelación gratuita.

**Errores posibles:** `TRIP_001`, `TRIP_002`

---

### POST /trips/:id/accept

El conductor acepta la solicitud de viaje.

**Requiere:** Bearer token (rol `driver`)

**Request** — body vacío

**Response 200**
```json
{
  "success": true,
  "data": {
    "trip": {
      "id":     "trip_550e8400",
      "status": "accepted",
      "passenger": {
        "id":        "550e8400-...",
        "full_name": "Ana García",
        "rating":    4.87
      },
      "origin": {
        "lat":     19.4326,
        "lng":     -99.1332,
        "address": "Insurgentes Sur 1234, Col. Narvarte, CDMX"
      },
      "destination": {
        "address": "Zócalo, Centro Histórico, CDMX"
      },
      "notes":          "Por favor espérame en la entrada principal",
      "estimated_fare": 98.83,
      "accepted_at":    "2024-01-15T23:02:00Z"
    }
  }
}
```

**Errores posibles:** `TRIP_001`, `TRIP_002`, `TRIP_005`

---

### POST /trips/:id/start-route

El conductor confirma que inició su desplazamiento hacia el pasajero.

**Request** — body vacío

**Response 200**
```json
{
  "success": true,
  "data": {
    "trip": {
      "id":     "trip_550e8400",
      "status": "driver_en_route"
    }
  }
}
```

---

### POST /trips/:id/arrived

El conductor confirma que llegó al punto de origen.

**Request** — body vacío

**Response 200**
```json
{
  "success": true,
  "data": {
    "trip": {
      "id":               "trip_550e8400",
      "status":           "driver_arrived",
      "driver_arrived_at": "2024-01-15T23:08:00Z",
      "wait_timeout_at":  "2024-01-15T23:13:00Z"
    }
  }
}
```

> **Nota:** `wait_timeout_at` indica cuándo el sistema marcará `no_show` si el pasajero no aborda.

---

### POST /trips/:id/start-trip

El conductor confirma que el pasajero abordó.

**Request** — body vacío

**Response 200**
```json
{
  "success": true,
  "data": {
    "trip": {
      "id":         "trip_550e8400",
      "status":     "in_progress",
      "started_at": "2024-01-15T23:09:00Z"
    }
  }
}
```

---

### POST /trips/:id/complete

El conductor confirma que llegaron al destino.

**Request** — body vacío

**Response 200**
```json
{
  "success": true,
  "data": {
    "trip": {
      "id":           "trip_550e8400",
      "status":       "completed",
      "completed_at": "2024-01-15T23:27:00Z",
      "actual_fare":  98.83,
      "breakdown": {
        "base_fare":       30.00,
        "distance_fare":   32.50,
        "time_fare":       10.00,
        "applied_factors": [
          {
            "name":   "Servicio nocturno",
            "impact": 18.33
          }
        ],
        "subtotal":   90.83,
        "tax_amount": 8.00,
        "total":      98.83
      },
      "actual_distance": 3.4,
      "actual_duration": 18,
      "receipt_url":     "https://api.tudominio.com/receipts/trip_550e8400.pdf"
    }
  }
}
```

---

### POST /trips/:id/cancel

El conductor cancela el viaje.

**Requiere:** Bearer token (rol `driver`, debe ser el conductor del viaje)

**Request**
```json
{
  "reason": "Accidente en la ruta"
}
```

**Response 200**
```json
{
  "success": true,
  "data": {
    "trip": {
      "id":           "trip_550e8400",
      "status":       "cancelled_by_driver",
      "cancelled_at": "2024-01-15T23:05:00Z"
    }
  }
}
```

---

### POST /trips/:id/rate

Califica al otro actor del viaje.

**Requiere:** Bearer token (pasajero o conductor del viaje)

**Request**
```json
{
  "score":   5,
  "comment": "Excelente conductor, muy puntual"
}
```

| Campo | Tipo | Requerido | Validación |
|---|---|---|---|
| `score` | number | ✓ | Entero entre 1 y 5 |
| `comment` | string | — | Máximo 500 caracteres |

**Response 200**
```json
{
  "success": true,
  "data": { "rated": true }
}
```

**Errores posibles:** `TRIP_001`, `TRIP_002` (si el viaje no está completado)

---

### GET /trips/:id/receipt

Retorna el recibo del viaje.

**Requiere:** Bearer token (pasajero o conductor del viaje)

**Response 200**
```json
{
  "success": true,
  "data": {
    "receipt": {
      "trip_id":        "trip_550e8400",
      "date":           "2024-01-15T23:27:00Z",
      "passenger_name": "Ana García",
      "driver_name":    "Carlos Mendoza",
      "vehicle":        "Toyota Corolla 2021 — ABC-1234",
      "origin":         "Insurgentes Sur 1234, Col. Narvarte",
      "destination":    "Zócalo, Centro Histórico",
      "distance_km":    3.4,
      "duration_min":   18,
      "breakdown": {
        "base_fare":       30.00,
        "distance_fare":   32.50,
        "time_fare":       10.00,
        "subtotal":        90.83,
        "tax_label":       "IVA 16%",
        "tax_amount":      8.00,
        "total":           98.83
      },
      "payment_method": "Visa ···4242",
      "pdf_url":        "https://api.tudominio.com/receipts/trip_550e8400.pdf"
    }
  }
}
```

---

## 7. Admin

> Todos los endpoints de admin requieren Bearer token con rol `admin`.

### GET /admin/dashboard/realtime

**Response 200**
```json
{
  "success": true,
  "data": {
    "kpis": {
      "active_trips":          47,
      "online_drivers":        183,
      "completed_trips_today": 1240,
      "revenue_today":         34291.50,
      "cancellation_rate":     0.082,
      "avg_matching_seconds":  45
    },
    "alerts": [
      {
        "id":        "alert_001",
        "rule":      "payment_queue_backlog",
        "severity":  "critical",
        "message":   "Cola de pagos: 3 jobs pendientes",
        "value":     3,
        "created_at":"2024-01-15T23:00:00Z"
      }
    ]
  }
}
```

---

### GET /admin/trips

**Query params:** `status`, `driver_id`, `passenger_id`, `from`, `to`, `page`, `per_page`

**Response 200** — lista paginada de viajes con datos básicos

---

### GET /admin/trips/:id/full-timeline

Retorna el historial completo del viaje para diagnóstico.

**Response 200**
```json
{
  "success": true,
  "data": {
    "trip": { },
    "timeline": [
      {
        "from_status": null,
        "to_status":   "requested",
        "actor_type":  "passenger",
        "actor_name":  "Ana García",
        "reason":      null,
        "created_at":  "2024-01-15T23:00:00Z"
      }
    ],
    "gps_points_count": 142,
    "route_available":  true
  }
}
```

---

### PATCH /admin/drivers/:id/documents/:docId/review

**Request**
```json
{
  "action":           "reject",
  "rejection_reason": "La imagen está borrosa, por favor sube una foto más clara"
}
```

**Response 200**
```json
{
  "success": true,
  "data": {
    "document": {
      "id":               "770e8400-...",
      "status":           "rejected",
      "rejection_reason": "La imagen está borrosa...",
      "reviewed_at":      "2024-01-15T10:30:00Z"
    }
  }
}
```

---

### POST /admin/operations/failed-payments/:id/retry

Reintenta manualmente un pago fallido.

**Request** — body vacío

**Response 200**
```json
{
  "success": true,
  "data": {
    "payment": {
      "id":     "pay_001",
      "status": "processing",
      "message":"Reintento iniciado"
    }
  }
}
```

---

## 8. WebSocket Events

### Conexión

```javascript
// Pasajero
const socket = io('https://api.tudominio.com/passenger', {
  auth: { token: accessToken }
});

// Conductor
const socket = io('https://api.tudominio.com/driver', {
  auth: { token: accessToken }
});

// Admin
const socket = io('https://api.tudominio.com/admin', {
  auth: { token: accessToken }
});
```

---

### Namespace /passenger

#### Cliente → Servidor

```javascript
// Suscribirse a eventos de un viaje
socket.emit('trip.subscribe', { trip_id: 'trip_550e8400' });

// Desuscribirse
socket.emit('trip.unsubscribe', { trip_id: 'trip_550e8400' });
```

#### Servidor → Cliente

```javascript
// Estado del viaje cambió
socket.on('trip.status_changed', (data) => {
  // data: {
  //   trip_id:   "trip_550e8400",
  //   status:    "accepted",
  //   driver:    { id, full_name, rating, vehicle, location },
  //   timestamp: "2024-01-15T23:02:00Z"
  // }
});

// Posición del conductor actualizada
socket.on('driver.location_updated', (data) => {
  // data: {
  //   trip_id:     "trip_550e8400",
  //   lat:         19.4350,
  //   lng:         -99.1400,
  //   heading:     180.5,
  //   eta_seconds: 240
  // }
});

// Conductor llegó al origen
socket.on('trip.driver_arrived', (data) => {
  // data: {
  //   trip_id:        "trip_550e8400",
  //   wait_seconds:   300
  // }
});

// Viaje completado
socket.on('trip.completed', (data) => {
  // data: {
  //   trip_id:     "trip_550e8400",
  //   fare:        98.83,
  //   breakdown:   { ... },
  //   receipt_url: "https://..."
  // }
});

// No se encontró conductor
socket.on('trip.no_driver_found', (data) => {
  // data: { trip_id: "trip_550e8400" }
});
```

---

### Namespace /driver

#### Cliente → Servidor

```javascript
// Actualizar posición (cada 3-5 seg cuando online)
socket.emit('driver.location', {
  lat:      19.4350,
  lng:      -99.1400,
  heading:  180.5,
  speed:    35.2,
  accuracy: 5.0
});
```

#### Servidor → Cliente

```javascript
// Nueva solicitud de viaje
socket.on('trip.request', (data) => {
  // data: {
  //   trip_id:          "trip_550e8400",
  //   passenger: {
  //     full_name:      "Ana García",
  //     rating:         4.87
  //   },
  //   origin: {
  //     address:            "Insurgentes Sur 1234...",
  //     lat:                19.4326,
  //     lng:                -99.1332,
  //     distance_to_driver: 0.8,
  //     eta_to_origin:      180
  //   },
  //   destination: {
  //     address: "Zócalo, Centro Histórico"
  //   },
  //   estimated_fare:     98.83,
  //   estimated_duration: 18,
  //   expires_at:         "2024-01-15T23:01:30Z"  // 30 segundos desde la solicitud (configurable)
  // }
});

// La solicitud expiró (otro conductor la tomó o timeout)
socket.on('trip.request_expired', (data) => {
  // data: { trip_id: "trip_550e8400" }
});

// El pasajero canceló
socket.on('trip.cancelled_by_passenger', (data) => {
  // data: {
  //   trip_id: "trip_550e8400",
  //   reason:  "Me equivoqué de destino"
  // }
});
```

---

### Namespace /admin

#### Servidor → Cliente

```javascript
// Actualización del dashboard (cada 5 seg)
socket.on('dashboard.update', (data) => {
  // data: {
  //   active_trips:   47,
  //   online_drivers: 183,
  //   timestamp:      "2024-01-15T23:00:00Z"
  // }
});

// Posiciones de todos los conductores (cada 5 seg)
socket.on('drivers.positions', (data) => {
  // data: {
  //   drivers: [
  //     { id, lat, lng, heading, status: "online" | "on_trip" }
  //   ]
  // }
});

// Alerta disparada
socket.on('alert.triggered', (data) => {
  // data: {
  //   rule:     "payment_queue_backlog",
  //   severity: "critical",
  //   message:  "Cola de pagos: 3 jobs pendientes",
  //   value:    3
  // }
});
```

---

## 9. Rate Limits

Los límites se retornan en los headers de cada respuesta:

```
X-RateLimit-Limit:     100
X-RateLimit-Remaining: 87
X-RateLimit-Reset:     1705363200
```

Cuando se excede el límite, la API retorna `HTTP 429` con:
```json
{
  "success": false,
  "error": {
    "code":        "RATE_LIMIT_EXCEEDED",
    "message":     "Demasiadas solicitudes. Intenta de nuevo en 60 segundos.",
    "retry_after": 60
  }
}
```

| Endpoint | Límite | Ventana |
|---|---|---|
| `POST /auth/login` | 5 | 15 min |
| `POST /auth/verify-phone` | 3 | 10 min |
| `POST /auth/register` | 3 | 1 hora |
| `POST /trips` | 10 | 1 hora |
| `POST /trips/estimate` | 30 | 1 hora |
| `PATCH /drivers/me/location` | 1,000 | 1 hora |
| Default | 100 | 1 min |

---

## 10. Changelog

| Versión | Fecha | Cambios |
|---|---|---|
| v1.0.0 | 2024-01-15 | Versión inicial — MVP Taxi México |

---

## Notas para integradores

### Mobile
- Implementar reconexión automática en WebSocket — el servidor cierra conexiones inactivas > 30 seg
- El endpoint `PATCH /drivers/me/location` debe llamarse aunque el socket esté caído — HTTP como respaldo
- Cachear el token JWT en MMKV — nunca en AsyncStorage por seguridad

### Web Admin
- El dashboard usa WebSocket para actualizaciones en tiempo real — no polling
- Los mapas de conductores reciben posiciones via WebSocket event `drivers.positions` cada 5 seg

### Testing contra la API
- Usar el header `X-Test-Mode: true` en staging para evitar llamadas reales a Stripe y Google Maps
- Stripe en staging usa las keys `sk_test_*` — los cobros no son reales
- OTP en staging siempre acepta `123456` como código válido
