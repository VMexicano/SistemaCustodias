---
name: mobile-react-native-offline
description: Build offline-first React Native screens and services for iOS and Android using TypeScript 5 strict, React Query 5, Zustand 4, MMKV, Google Maps SDK native, Socket.io 4 client, and React Native Reanimated 3. Use when implementing passenger or driver screens, GPS tracking services, real-time trip updates, push notification handling, or any mobile feature that must tolerate poor connectivity. Prioritizes performance on low-end Android (3GB RAM) and sub-200ms UI feedback.
---

This skill guides the construction of a mobile app where connectivity is unreliable, GPS must always work, and a driver's livelihood depends on the app not freezing. Every screen and service must be built for the conditions in Mexico City traffic — patchy LTE, cheap Android phones, and users who can't afford a failed ride.

The agent receives a task: a screen, a service, or a feature to implement. Context includes the wireframe reference, available API endpoints, WebSocket events, and any existing screens it must integrate with.

## Product Thinking Before Code

Before writing any component, answer:

- **Who uses this screen?** Passenger (needs simplicity, speed) or driver (needs focus, minimal distraction while driving)
- **What's the worst case?** No internet, GPS spoofing, app in background, phone call interrupting
- **What's the minimum viable version?** Implement functional first, animations second
- **What does the user need in < 200ms?** That's what gets optimistic UI treatment

## Offline-First Architecture

The GPS queue is the heart of driver reliability. When connectivity drops, location data must be preserved and synced when the network returns — with original timestamps, not the reconnection time.

```typescript
class LocationService {
  private queue: LocationPoint[] = [];

  async sendLocation(point: LocationPoint): Promise<void> {
    if (!this.isConnected) {
      this.queue.push(point);
      MMKV.set('offline_gps_queue', JSON.stringify(this.queue));
      return; // Silent — user doesn't need to know about this
    }
    await this.flushQueue(); // Always flush before sending current point
    await api.patch('/drivers/me/location', point);
  }

  async flushQueue(): Promise<void> {
    if (this.queue.length === 0) return;
    await api.post('/drivers/me/location/batch', { points: this.queue });
    this.queue = [];
    MMKV.delete('offline_gps_queue');
  }

  // Called on app foreground and network reconnect
  async onReconnect(): Promise<void> {
    const stored = MMKV.getString('offline_gps_queue');
    if (stored) this.queue = JSON.parse(stored);
    await this.flushQueue();
  }
}
```

Load the queue from MMKV at service initialization — it survives app restarts.

## State Management — One Layer Per Concern

Never mix concerns between layers. A component that reads from React Query AND writes to Zustand AND reads from MMKV directly is a maintenance nightmare.

| Layer | Tool | What It Manages |
|---|---|---|
| Server state | React Query | API responses, cache, background refetch |
| Global app state | Zustand | Authenticated user, active trip, driver status |
| Screen-local state | useState / useReducer | Form fields, modal visibility, step progress |
| Persistent local state | MMKV | JWT tokens, GPS queue, user preferences, offline data |

```typescript
// Zustand store — lean, only what must be global
const useTripStore = create<TripState>()(
  persist(
    (set) => ({
      activeTrip: null,
      setActiveTrip: (trip) => set({ activeTrip: trip }),
      clearActiveTrip: () => set({ activeTrip: null }),
    }),
    { storage: createMMKVStorage(), name: 'trip-store' }
  )
);

// React Query — server data with background sync
const { data: tripHistory } = useQuery({
  queryKey: ['trips', 'history', passengerId],
  queryFn: () => api.get(`/trips?passenger_id=${passengerId}`),
  staleTime: 30_000, // 30s before background refetch
});
```

## Optimistic UI — Sub-200ms Rule

Any action that the user initiates must feel instant. Update local state before the network call confirms it.

```typescript
// Trip request — show "searching" immediately
const requestTrip = useMutation({
  mutationFn: (dto: CreateTripDto) => api.post('/trips', dto),
  onMutate: async (dto) => {
    // 1. Cancel any outgoing refetches
    await queryClient.cancelQueries({ queryKey: ['trips', 'active'] });
    // 2. Optimistically set the state
    useTripStore.getState().setActiveTrip({ status: 'SEARCHING', ...dto });
    // 3. Return context for rollback
    return { previousTrip: null };
  },
  onError: (err, dto, context) => {
    // Rollback on failure
    useTripStore.getState().clearActiveTrip();
  },
  onSuccess: (realTrip) => {
    // Replace optimistic data with server data
    useTripStore.getState().setActiveTrip(realTrip);
  },
});
```

## Google Maps — SDK Nativo Only

The JavaScript wrapper for Google Maps in React Native has documented performance issues: dropped frames during map gestures, memory leaks on route rendering. Always use the native SDK bridge.

```typescript
// WRONG — JS wrapper
import MapView from 'react-native-maps';

// CORRECT — native SDK via the established bridge in this project
import { GoogleMap } from '../lib/native-maps';

// Map renders at 60fps on low-end devices
// Route polylines are rendered natively — no React re-renders
// Marker clustering is handled by the SDK
```

## Driver TripRequestModal — Countdown Is Critical

The driver has 30 seconds to accept or reject a trip request. The countdown must be accurate, visible, and the modal must auto-dismiss on timeout.

```typescript
const TripRequestModal = ({ request, onAccept, onReject }: Props) => {
  const [secondsLeft, setSecondsLeft] = useState(30);

  useEffect(() => {
    if (secondsLeft === 0) { onReject(); return; }
    const timer = setInterval(() => setSecondsLeft(s => s - 1), 1000);
    return () => clearInterval(timer);
  }, [secondsLeft]);

  // Visual urgency: color shifts red below 10 seconds
  const urgencyColor = secondsLeft <= 10 ? colors.error : colors.primary600;
  // ...
};
```

## Performance Rules for Low-End Android

- **Images**: Compress driver/vehicle documents client-side before upload. Max 2MB. Use `react-native-image-resizer`.
- **Lists**: Always use `FlatList` or `FlashList`, never `ScrollView` with `.map()` for variable-length lists.
- **Animations**: Test on a device with 3GB RAM before committing. If it drops below 55fps, remove the animation.
- **Map updates**: Debounce driver location marker updates to max 1/second. Animating on every GPS event causes jank.
- **Skeleton screens**: Always use skeletons (not spinners) for list loads. Spinners increase perceived wait time.

## Socket.io — Reconnection and Event Handling

```typescript
class SocketService {
  private socket: Socket;

  connect(token: string): void {
    this.socket = io(API_URL, {
      auth: { token },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: Infinity, // Never give up
    });

    this.socket.on('connect', () => {
      locationService.onReconnect(); // Flush GPS queue on reconnect
    });

    this.socket.on('trip:accepted', (trip: Trip) => {
      useTripStore.getState().setActiveTrip(trip);
    });

    this.socket.on('driver:location', (location: DriverLocation) => {
      // Update marker on map — debounced in the component
    });
  }
}
```

## Design System — Non-Negotiable Values

```typescript
export const colors = {
  primary900: '#1F3864',  // Headers, primary text
  primary600: '#2E75B6',  // Buttons, active states, links
  primary100: '#EBF3FB',  // Card backgrounds
  primary50:  '#F4F9FD',  // Page background
  success:    '#28A745',  // Online, completed, approved
  warning:    '#FFC107',  // En camino, documents expiring
  error:      '#DC3545',  // Cancelled, suspended, error
  neutral:    '#6C757D',  // Secondary text, placeholders
};

// Touch targets — WCAG minimum 44×44px, always
const hitSlop = { top: 12, bottom: 12, left: 12, right: 12 };

// Typography — minimum 14px body, 12px for captions only
// WCAG AA contrast — test every text/background combination
```

## What NEVER to do

- **Never** use the JavaScript Google Maps wrapper — only the native SDK
- **Never** render a list with `ScrollView + .map()` — use FlatList/FlashList
- **Never** make a network call inside a render function — use React Query
- **Never** store JWT tokens in AsyncStorage — use MMKV (encrypted)
- **Never** implement offline GPS sync without preserving original timestamps
- **Never** show a spinner for list loads — use skeleton screens
- **Never** block the JS thread for image processing — offload to a worker
- **Never** add animations before the functional version is verified on low-end device
- **Never** use `useEffect` for data fetching — use React Query
- **Never** call Socket.io events directly from components — always through SocketService

## Checklist Before Emitting Handoff

```
□ Offline scenarios handled (GPS queue, optimistic UI rollback)
□ Tested on a simulated low-end device profile (3GB RAM, slow CPU)
□ All lists use FlatList or FlashList
□ Touch targets ≥ 44×44px
□ MMKV used for persistence (not AsyncStorage)
□ Google Maps SDK native (not JS wrapper)
□ Socket.io events handled through SocketService
□ Skeleton screens for async loads
□ Animations removed or deferred if perf impact detected
```
