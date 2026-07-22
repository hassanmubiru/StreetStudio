# Design Document: StreetStudio Web Application Implementation

## Overview

The StreetStudio Web Application is a comprehensive Single Page Application (SPA) that provides the primary user interface for video recording, reviewing, editing, and collaboration. Built as a modern web client (`apps/web`), it consumes the existing StreetStudio backend services through the published `@streetstudio/dashboard` package and communicates with backend APIs to deliver a complete production experience.

### Key Design Principles

1. **Component-Driven Architecture**: Leveraging the existing `@streetstudio/ui` design system with additional application-specific components
2. **Progressive Enhancement**: Core functionality works with JavaScript disabled, enhanced with dynamic features
3. **Accessibility First**: WCAG AA compliance throughout all interfaces and workflows
4. **Performance Optimized**: Code splitting, lazy loading, and efficient caching strategies
5. **Real-time Collaboration**: WebSocket-based live updates for comments, presence, and collaboration features
6. **Responsive Design**: Mobile-first approach with breakpoint-specific optimizations
7. **Offline Resilience**: Service worker implementation for offline functionality and background sync
8. **Security by Design**: Content Security Policy, secure authentication flows, and data protection

### Technical Foundation

The web application builds upon the existing foundation:
- **UI Components**: `@streetstudio/ui` provides the base design system and reusable components
- **Business Logic**: `@streetstudio/dashboard` handles session management and API interactions
- **Type Safety**: `@streetstudio/shared` provides comprehensive DTOs and type definitions
- **Modern Tooling**: Vite for development and build tooling with TypeScript for type safety

## Architecture

### Application Structure

```
apps/web/
├── src/
│   ├── app/                    # Core application logic
│   │   ├── app.ts             # Main application class
│   │   ├── router.ts          # Client-side routing
│   │   ├── auth/              # Authentication controllers
│   │   ├── layout/            # Layout management
│   │   ├── navigation/        # Navigation controllers
│   │   ├── notifications/     # Notification system
│   │   ├── error-boundary.ts  # Error handling
│   │   └── keyboard-shortcuts.ts # Global shortcuts
│   ├── pages/                 # Route-based page components
│   │   ├── landing/           # Public landing page
│   │   ├── auth/              # Authentication pages
│   │   ├── dashboard/         # Main dashboard
│   │   ├── projects/          # Project management
│   │   ├── recordings/        # Recording interface
│   │   ├── review/            # Video review interface
│   │   ├── editor/            # Timeline editor
│   │   ├── search/            # Search interface
│   │   ├── notifications/     # Notification center
│   │   └── settings/          # Settings management
│   ├── components/            # Application-specific components
│   │   ├── media/             # Video player components
│   │   ├── timeline/          # Timeline editor components
│   │   ├── collaboration/     # Comment and reaction components
│   │   ├── upload/            # Upload management components
│   │   └── workspace/         # Workspace-specific components
│   ├── services/              # Service layer abstractions
│   │   ├── api.ts             # API client wrapper
│   │   ├── websocket.ts       # WebSocket connection management
│   │   ├── upload.ts          # Upload service
│   │   ├── media.ts           # Media playback service
│   │   └── storage.ts         # Local storage management
│   ├── stores/                # State management
│   │   ├── auth-store.ts      # Authentication state
│   │   ├── workspace-store.ts # Current workspace state
│   │   ├── upload-store.ts    # Upload progress state
│   │   └── notification-store.ts # Notification state
│   ├── styles/                # Styling and themes
│   │   ├── global.css         # Global styles
│   │   ├── components.css     # Component-specific styles
│   │   └── themes/            # Theme definitions
│   ├── utils/                 # Application utilities
│   │   ├── constants.ts       # Application constants
│   │   ├── helpers.ts         # Utility functions
│   │   └── validation.ts      # Form validation
│   └── main.ts                # Application entry point
├── public/                    # Static assets
│   ├── icons/                 # App icons and favicons
│   ├── images/                # Static images
│   └── manifest.json          # PWA manifest
├── index.html                 # HTML entry point
├── package.json               # Dependencies and scripts
└── vite.config.ts            # Build configuration
```
### Module Dependencies and Data Flow

```mermaid
graph TB
    subgraph "Frontend (Web App)"
        A[Main App] --> B[Router]
        A --> C[Auth Controller]
        A --> D[Layout Controller]
        A --> E[Notification Controller]
        
        B --> F[Page Components]
        F --> G[Feature Components]
        G --> H[UI Components]
        
        C --> I[Auth Store]
        D --> J[Workspace Store]
        E --> K[Notification Store]
        
        L[Services] --> M[API Client]
        L --> N[WebSocket Client]
        L --> O[Upload Service]
        L --> P[Media Service]
    end
    
    subgraph "Published Packages"
        Q[@streetstudio/dashboard] --> R[DashboardSession]
        Q --> S[Business Logic]
        T[@streetstudio/ui] --> U[Design System]
        T --> V[Base Components]
        W[@streetstudio/shared] --> X[DTOs]
        W --> Y[Types]
    end
    
    subgraph "Backend Services"
        Z[REST API]
        AA[WebSocket Gateway]
        BB[Upload Service]
        CC[Media Delivery]
    end
    
    M --> Z
    N --> AA
    O --> BB
    P --> CC
    
    R --> M
    S --> Q
    G --> U
    H --> V
    I --> X
    J --> X
    K --> X
```

### State Management Architecture

The application uses a combination of local component state and centralized stores for global state management:

#### Core Stores

1. **AuthStore**: Manages authentication state, user sessions, and organization context
2. **WorkspaceStore**: Tracks current workspace, active project, and navigation context
3. **UploadStore**: Manages upload progress, queue, and background upload state
4. **NotificationStore**: Handles notification state, unread counts, and delivery status

#### State Flow Patterns

- **Unidirectional Data Flow**: Actions trigger state updates that flow down to components
- **Reactive Updates**: WebSocket events trigger state updates that propagate through the UI
- **Optimistic Updates**: Local state updates immediately with server reconciliation
- **Background Sync**: Offline actions queue and sync when connectivity resumes

## Components and Interfaces

### Core Component Hierarchy

The application extends the base UI component library with specialized components for video collaboration:

#### Layout Components

**AppShell**: Main application wrapper providing:
- Global navigation and user menu
- Notification system integration
- Keyboard shortcut handling
- Error boundary implementation
- Theme and accessibility context

**Sidebar**: Contextual navigation providing:
- Organization and workspace switcher
- Primary navigation menu
- Quick action buttons
- Breadcrumb navigation
- Collapsed/expanded states for mobile

**TopBar**: Header component providing:
- Logo and branding
- Global search interface
- Notification bell with unread count
- User avatar and dropdown menu
- Organization context indicator
#### Media Components

**VideoPlayer**: Adaptive video player providing:
- Multi-quality adaptive streaming
- Keyboard and touch controls
- Picture-in-picture mode
- Captions and transcript display
- Playback speed controls
- Timeline scrubbing with frame accuracy
- Full-screen mode support

**Timeline**: Video timeline component providing:
- Frame-accurate scrubbing
- Comment markers and threads
- Trim and split controls
- Zoom and navigation
- Waveform visualization
- Multi-track support for editing

**RecordingControls**: Browser recording interface providing:
- Screen/window/tab selection
- Recording state indicators
- Drawing and annotation tools
- Cursor highlighting options
- Audio level indicators
- Keyboard shortcut overlay

#### Collaboration Components

**CommentSystem**: Threaded comment interface providing:
- Timestamp-anchored comments
- Threaded replies and discussions
- @mention autocomplete
- Reaction buttons and tallies
- Real-time updates and notifications
- Comment moderation tools

**PresenceIndicators**: Real-time collaboration providing:
- User avatars and status
- Typing indicators
- Current viewers list
- Collaborative viewing sync
- Activity feed updates

**ReactionPanel**: Reaction interface providing:
- Quick reaction buttons
- Custom reaction types
- Reaction aggregation and display
- Real-time reaction updates
- Accessibility keyboard controls

#### Upload Components

**UploadManager**: File upload interface providing:
- Drag-and-drop upload zones
- Progress tracking and visualization
- Batch upload management
- Error handling and retry logic
- Background upload capabilities
- Metadata collection forms

**UploadProgress**: Progress tracking providing:
- Individual file progress
- Overall batch progress
- Upload speed and ETA
- Pause and resume controls
- Error state handling

### Component Design Patterns

#### Compound Components

Complex interfaces use compound component patterns for flexibility:

```typescript
// Timeline editor with flexible composition
<TimelineEditor>
  <TimelineEditor.Track>
    <TimelineEditor.Video src="..." />
    <TimelineEditor.Comments comments={comments} />
  </TimelineEditor.Track>
  <TimelineEditor.Controls>
    <TimelineEditor.PlayButton />
    <TimelineEditor.ZoomControls />
  </TimelineEditor.Controls>
</TimelineEditor>
```

#### Render Props for Data Fetching

Data components use render props for flexible rendering:

```typescript
// Flexible data fetching with render props
<VideoLoader videoId={videoId}>
  {({ video, loading, error }) => (
    loading ? <LoadingSkeleton /> :
    error ? <ErrorMessage error={error} /> :
    <VideoPlayer video={video} />
  )}
</VideoLoader>
```

#### Hook-Based State Management

Custom hooks encapsulate complex state logic:

```typescript
// Centralized upload state management
const useUploadManager = () => {
  const { uploads, addUpload, updateProgress } = useUploadStore();
  const { showNotification } = useNotifications();
  
  const startUpload = useCallback((file: File) => {
    // Upload logic with progress callbacks
  }, []);
  
  return { uploads, startUpload };
};
```
## Data Models

### Client-Side Data Models

The web application uses the DTOs from `@streetstudio/shared` as the primary data model, enhanced with client-specific properties:

#### Enhanced Video Model

```typescript
interface ClientVideoDto extends VideoDto {
  // Client-specific computed properties
  isProcessing: boolean;
  thumbnailUrl?: string;
  previewUrl?: string;
  streamingUrl?: string;
  
  // UI state
  isSelected?: boolean;
  isPlaying?: boolean;
  currentTime?: number;
  
  // Collaboration state
  activeViewers?: MemberDto[];
  commentCount?: number;
  reactionCounts?: Record<string, number>;
}
```

#### UI State Models

```typescript
// Authentication state
interface AuthState {
  isAuthenticated: boolean;
  currentUser?: MemberDto;
  currentOrganization?: OrganizationDto;
  permissions: string[];
  sessionExpiry?: IsoTimestamp;
}

// Workspace context
interface WorkspaceState {
  currentWorkspace?: WorkspaceDto;
  currentProject?: ProjectDto;
  currentFolder?: FolderDto;
  breadcrumbs: BreadcrumbItem[];
  sidebarCollapsed: boolean;
}

// Upload management
interface UploadState {
  uploads: UploadItem[];
  isUploading: boolean;
  totalProgress: number;
  completedUploads: number;
  failedUploads: number;
}

// Notification system
interface NotificationState {
  notifications: NotificationDto[];
  unreadCount: number;
  isLoading: boolean;
  lastFetch?: IsoTimestamp;
}
```

#### Form Models

```typescript
// Video upload form
interface VideoUploadForm {
  file?: File;
  title: string;
  description?: string;
  projectId?: Uuid;
  folderId?: Uuid;
  tags: string[];
  isPrivate: boolean;
  developerMode: boolean;
}

// Project creation form
interface ProjectForm {
  name: string;
  description?: string;
  isPrivate: boolean;
  initialMembers: string[]; // email addresses
}

// Comment form
interface CommentForm {
  body: string;
  timestampSeconds?: number;
  parentCommentId?: Uuid;
  mentions: Uuid[]; // member IDs
}
```

### Data Validation and Transformation

#### Client-Side Validation

```typescript
// Comprehensive validation rules
const ValidationRules = {
  video: {
    title: {
      required: true,
      minLength: 1,
      maxLength: 255,
      pattern: /^[^<>{}]+$/ // No HTML-like content
    },
    description: {
      maxLength: 2000,
      pattern: /^[^<>{}]*$/ // No HTML-like content
    }
  },
  
  project: {
    name: {
      required: true,
      minLength: 1,
      maxLength: 100,
      pattern: /^[a-zA-Z0-9\s\-_.]+$/ // Alphanumeric with safe chars
    }
  },
  
  comment: {
    body: {
      required: true,
      minLength: 1,
      maxLength: 1000,
      pattern: /^[\s\S]*$/ // Any content but length limited
    }
  }
};
```

#### Data Transformers

```typescript
// Transform server DTOs to client models
const transformVideoForClient = (video: VideoDto): ClientVideoDto => ({
  ...video,
  isProcessing: ['uploading', 'queued', 'processing'].includes(video.status),
  thumbnailUrl: `/api/videos/${video.id}/thumbnail`,
  streamingUrl: video.status === 'ready' ? `/api/videos/${video.id}/stream` : undefined,
  activeViewers: [],
  commentCount: 0,
  reactionCounts: {}
});

// Transform client forms to API requests
const transformVideoFormToRequest = (form: VideoUploadForm) => ({
  title: form.title.trim(),
  description: form.description?.trim() || '',
  folderId: form.folderId,
  developerMode: form.developerMode,
  // File handled separately in upload
});
```
## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

Based on the prework analysis, several acceptance criteria are suitable for property-based testing where universal behaviors can be verified across varying inputs:

### Property 1: Authentication Security Consistency

*For any* set of invalid login credentials, the authentication system SHALL display a generic error message without revealing which specific credential was incorrect and SHALL clear the password field.

**Validates: Requirements 1.3**

### Property 2: Password Reset Security Uniformity  

*For any* email address (valid, invalid, existing, or non-existing), the password reset request SHALL display the same confirmation message and follow the same response pattern.

**Validates: Requirements 1.5**

### Property 3: Keyboard Navigation Universality

*For any* navigation element in the top navigation bar, keyboard navigation SHALL provide the same accessibility and functionality as mouse interaction with proper focus indicators.

**Validates: Requirements 2.2**

### Property 4: Recording Control Accessibility

*For any* screen content configuration, the recording control panel SHALL remain accessible and functional without obscuring critical content or interactive elements.

**Validates: Requirements 3.2**

### Property 5: Project Organization Consistency

*For any* valid project structure, the hierarchical display SHALL correctly represent folder nesting and drag-and-drop organization SHALL work consistently regardless of project complexity.

**Validates: Requirements 4.2**

### Property 6: Timeline Frame Accuracy

*For any* video content, the timeline editor SHALL provide frame-accurate positioning and the playback position indicator SHALL correspond exactly to the displayed frame.

**Validates: Requirements 6.1**

### Property 7: Collaboration Presence Reliability

*For any* number of concurrent users viewing a video, presence indicators SHALL accurately display all active viewers with correct avatar thumbnails and user information.

**Validates: Requirements 7.1**

### Property 8: Responsive Layout Adaptation

*For any* screen width between 320px and desktop resolution, the mobile interface SHALL provide appropriate responsive layouts that maintain functionality and usability.

**Validates: Requirements 10.1**

### Property 9: Universal Keyboard Accessibility

*For any* interactive element throughout the application, keyboard navigation SHALL provide complete accessibility with logical tab order and visible focus indicators.

**Validates: Requirements 11.1**

### Property 10: Error Handling Resilience

*For any* JavaScript error or exception that occurs during application execution, the error boundary SHALL catch and handle it gracefully without crashing the entire application.

**Validates: Requirements 13.1**

### Property 11: Search Functionality Consistency

*For any* search query input, the global search interface SHALL provide instant results and respond consistently to the keyboard shortcut (Cmd/Ctrl+K) activation.

**Validates: Requirements 14.1**

### Property 12: API Key Management Reliability

*For any* valid API key operation (generate, revoke, update), the management interface SHALL execute the operation consistently and update the UI state appropriately.

**Validates: Requirements 15.1**
## Error Handling

### Error Boundary Implementation

The application implements a comprehensive error handling strategy with multiple layers of resilience:

#### Global Error Boundary

```typescript
class ApplicationErrorBoundary {
  private errorReportingService: ErrorReportingService;
  private fallbackRenderer: FallbackRenderer;
  
  public handleError(error: Error, errorInfo: ErrorInfo): void {
    // Log error with context
    this.errorReportingService.captureException(error, {
      componentStack: errorInfo.componentStack,
      userId: this.getCurrentUserId(),
      organizationId: this.getCurrentOrganizationId(),
      route: this.getCurrentRoute(),
      timestamp: new Date().toISOString()
    });
    
    // Determine error severity and response
    const severity = this.categorizeError(error);
    
    switch (severity) {
      case 'fatal':
        this.renderFatalErrorFallback(error);
        break;
      case 'recoverable':
        this.renderRecoverableErrorFallback(error);
        break;
      case 'minor':
        this.showErrorNotification(error);
        break;
    }
  }
}
```

#### Error Categories and Responses

**Fatal Errors**: Complete application failure
- Network connectivity issues preventing authentication
- Critical JavaScript errors in core application logic
- WebAssembly or service worker failures
- Response: Full-page error state with recovery options

**Recoverable Errors**: Feature-level failures
- API request failures with retry capability
- Media loading or playback errors
- Upload failures with resume capability
- Response: Contextual error messages with retry actions

**Minor Errors**: Transient issues
- Form validation errors
- Toast notification failures
- Non-critical feature unavailability
- Response: Inline error messages or notifications

#### Network Error Handling

```typescript
class NetworkErrorHandler {
  private retryPolicy = {
    maxRetries: 3,
    backoffMultiplier: 2,
    initialDelay: 1000,
    maxDelay: 10000
  };
  
  public async handleApiError(error: ApiError): Promise<void> {
    switch (error.status) {
      case 401: // Unauthorized
        await this.handleAuthenticationError();
        break;
      case 403: // Forbidden
        this.showPermissionError();
        break;
      case 429: // Rate Limited
        await this.handleRateLimitError(error);
        break;
      case 500: // Server Error
        await this.handleServerError(error);
        break;
      default:
        this.showGenericError(error);
    }
  }
  
  private async handleAuthenticationError(): Promise<void> {
    // Clear stored authentication
    this.authStore.clearAuthentication();
    
    // Redirect to login with return URL
    const returnUrl = this.router.getCurrentPath();
    this.router.navigate(`/auth/login?return=${encodeURIComponent(returnUrl)}`);
    
    // Show user-friendly message
    this.notificationService.show({
      type: 'warning',
      message: 'Your session has expired. Please log in again.',
      duration: 5000
    });
  }
}
```

### Offline Support and Background Sync

#### Service Worker Implementation

```typescript
// service-worker.ts
class StreetStudioServiceWorker {
  private cacheStrategy = {
    // Cache static assets indefinitely
    static: 'cache-first',
    // Cache API responses with network fallback
    api: 'network-first',
    // Cache media with size limits
    media: 'cache-first-with-refresh'
  };
  
  public async handleFetch(event: FetchEvent): Promise<Response> {
    const url = new URL(event.request.url);
    
    // Route requests to appropriate cache strategy
    if (url.pathname.startsWith('/api/')) {
      return this.handleApiRequest(event.request);
    } else if (url.pathname.match(/\.(js|css|ico|png|jpg|svg)$/)) {
      return this.handleStaticRequest(event.request);
    } else {
      return this.handleNavigationRequest(event.request);
    }
  }
  
  private async handleApiRequest(request: Request): Promise<Response> {
    try {
      // Try network first
      const response = await fetch(request);
      
      // Cache successful responses
      if (response.ok) {
        this.cacheResponse(request, response.clone());
      }
      
      return response;
    } catch (error) {
      // Fallback to cache
      const cachedResponse = await this.getCachedResponse(request);
      
      if (cachedResponse) {
        // Queue for background sync when online
        this.queueBackgroundSync(request);
        return cachedResponse;
      }
      
      throw error;
    }
  }
}
```

#### Background Sync for Failed Operations

```typescript
class BackgroundSyncManager {
  private syncQueue: SyncOperation[] = [];
  
  public queueOperation(operation: SyncOperation): void {
    this.syncQueue.push(operation);
    this.persistQueue();
    
    // Register background sync if supported
    if ('serviceWorker' in navigator && 'sync' in window.ServiceWorkerRegistration.prototype) {
      navigator.serviceWorker.ready.then(registration => {
        return registration.sync.register('streetstudio-sync');
      });
    }
  }
  
  public async processSyncQueue(): Promise<void> {
    const operations = [...this.syncQueue];
    this.syncQueue = [];
    
    for (const operation of operations) {
      try {
        await this.executeOperation(operation);
      } catch (error) {
        // Re-queue failed operations
        this.syncQueue.push(operation);
      }
    }
    
    this.persistQueue();
  }
}
```
## Testing Strategy

### Dual Testing Approach

The testing strategy combines unit tests for specific examples and edge cases with property-based tests for universal behaviors:

#### Unit Testing Focus Areas

**Authentication Flows**
- Specific login scenarios (valid/invalid credentials)
- OAuth provider integration
- Session expiry handling
- Password reset workflows

**Component Integration**
- Page component rendering
- Navigation state management
- Form validation and submission
- Media player control interactions

**API Integration**
- Request/response handling
- Error response processing
- Upload progress tracking
- WebSocket connection management

**Accessibility Compliance**
- Screen reader compatibility
- Keyboard navigation paths
- Focus management
- ARIA attribute correctness

#### Property-Based Testing Implementation

Property tests verify universal behaviors across generated inputs using **fast-check** library with minimum 100 iterations per property:

**Authentication Security Properties**
```typescript
// Feature: web-application-implementation, Property 1: Authentication Security Consistency
fc.test('Invalid credentials always show generic error', fc.record({
  email: fc.string(),
  password: fc.string()
}), async (credentials) => {
  const result = await authController.login(credentials);
  expect(result.error.message).toBe('Invalid credentials');
  expect(result.passwordFieldCleared).toBe(true);
});
```

**Responsive Design Properties**  
```typescript
// Feature: web-application-implementation, Property 8: Responsive Layout Adaptation
fc.test('Layout adapts correctly to all screen widths', fc.integer(320, 1920), (width) => {
  const layout = renderLayout({ screenWidth: width });
  expect(layout.isUsable()).toBe(true);
  expect(layout.hasHorizontalScroll()).toBe(false);
  expect(layout.criticalElementsVisible()).toBe(true);
});
```

**Error Handling Properties**
```typescript
// Feature: web-application-implementation, Property 10: Error Handling Resilience
fc.test('Any JS error is handled gracefully', fc.anything(), (errorPayload) => {
  const error = new Error(JSON.stringify(errorPayload));
  const result = errorBoundary.handleError(error);
  expect(result.applicationCrashed).toBe(false);
  expect(result.errorLogged).toBe(true);
  expect(result.userNotified).toBe(true);
});
```

### Test Infrastructure

#### Test Environment Setup

```typescript
// test-setup.ts
import { configureTestEnvironment } from './test-utils';

// Mock external dependencies
jest.mock('@streetstudio/dashboard', () => ({
  DashboardSession: jest.fn().mockImplementation(() => ({
    authenticate: jest.fn(),
    getCurrentMember: jest.fn(),
    selectOrganization: jest.fn()
  }))
}));

// Setup test DOM environment
configureTestEnvironment({
  viewport: { width: 1024, height: 768 },
  localStorage: new Map(),
  sessionStorage: new Map(),
  mediaQueries: new Map()
});
```

#### Component Testing Utilities

```typescript
// Component testing helpers with accessibility checks
export const renderWithProviders = (
  component: JSX.Element,
  options?: RenderOptions
) => {
  const providers = (
    <AuthProvider>
      <WorkspaceProvider>
        <NotificationProvider>
          <Router>
            {component}
          </Router>
        </NotificationProvider>
      </WorkspaceProvider>
    </AuthProvider>
  );
  
  const result = render(providers, options);
  
  // Automatic accessibility auditing
  return {
    ...result,
    axeAudit: () => axe(result.container),
    findByRole: (role: string) => result.findByRole(role),
    getAllByRole: (role: string) => result.getAllByRole(role)
  };
};
```

#### Performance Testing

```typescript
// Performance benchmarking for critical paths
describe('Performance Requirements', () => {
  test('Initial page load under 3 seconds', async () => {
    const startTime = performance.now();
    
    await renderApplication();
    await waitForElementToBeVisible('[data-testid="dashboard"]');
    
    const loadTime = performance.now() - startTime;
    expect(loadTime).toBeLessThan(3000);
  });
  
  test('Video playback starts within 5 seconds', async () => {
    const player = await renderVideoPlayer({ videoId: 'test-video' });
    
    const startTime = performance.now();
    player.play();
    
    await waitFor(() => {
      expect(player.currentTime).toBeGreaterThan(0);
    });
    
    const playbackStartTime = performance.now() - startTime;
    expect(playbackStartTime).toBeLessThan(5000);
  });
});
```

### End-to-End Testing Strategy

#### Critical User Journey Testing

**Authentication Journey**
1. Landing page → Login → Dashboard (with timing)
2. Registration flow with email verification
3. Password reset workflow
4. OAuth/SSO authentication paths

**Recording Journey** 
1. Dashboard → Start Recording → Screen Selection
2. Recording controls and annotations
3. Stop recording → Upload progress → Video processing
4. Video available in library

**Collaboration Journey**
1. Open video → Add timestamped comment  
2. @mention team member → Notification delivery
3. Real-time presence and activity updates
4. Comment threading and reactions

#### Cross-Browser and Device Testing

**Browser Support Matrix**
- Chrome (latest 3 versions)
- Firefox (latest 3 versions) 
- Safari (latest 2 versions)
- Edge (latest 2 versions)

**Device Coverage**
- Desktop: 1920x1080, 1366x768, 1280x720
- Tablet: iPad (1024x768), Android tablet (800x1280)
- Mobile: iPhone (375x667), Android (360x640)

**Accessibility Testing**
- Screen reader testing (NVDA, JAWS, VoiceOver)
- Keyboard-only navigation testing
- High contrast mode validation
- Reduced motion preference testing
## Integration and API Communication

### Backend Integration Architecture

The web application integrates with StreetStudio backend services through well-defined interfaces:

#### Dashboard Session Integration

```typescript
// Primary integration through @streetstudio/dashboard
class WebApplicationSession {
  private dashboardSession: DashboardSession;
  private websocketClient: WebSocketClient;
  private uploadService: UploadService;
  
  constructor(config: SessionConfig) {
    this.dashboardSession = new DashboardSession({
      baseUrl: config.apiBaseUrl,
      transport: config.transport
    });
    
    this.websocketClient = new WebSocketClient({
      url: config.wsBaseUrl,
      authentication: () => this.dashboardSession.getAuthToken()
    });
    
    this.uploadService = new UploadService({
      endpoint: `${config.apiBaseUrl}/upload`,
      chunkSize: config.uploadChunkSize || 1024 * 1024 // 1MB chunks
    });
  }
  
  public async initialize(): Promise<void> {
    // Initialize session and establish connections
    await this.dashboardSession.initialize();
    await this.websocketClient.connect();
    this.setupRealtimeEventHandlers();
  }
}
```

#### API Client Abstraction

```typescript
// Unified API client with error handling and caching
class StreetStudioApiClient {
  private cache: RequestCache;
  private retryPolicy: RetryPolicy;
  
  public async request<T>(endpoint: string, options: RequestOptions): Promise<T> {
    const cacheKey = this.getCacheKey(endpoint, options);
    
    // Check cache first for GET requests
    if (options.method === 'GET') {
      const cached = await this.cache.get<T>(cacheKey);
      if (cached && !cached.isExpired()) {
        return cached.data;
      }
    }
    
    try {
      const response = await this.executeRequest(endpoint, options);
      
      // Cache successful responses
      if (response.ok && options.method === 'GET') {
        await this.cache.set(cacheKey, response.data, this.getCacheTTL(endpoint));
      }
      
      return response.data;
    } catch (error) {
      return this.handleRequestError(error, endpoint, options);
    }
  }
  
  private async handleRequestError(error: Error, endpoint: string, options: RequestOptions): Promise<any> {
    // Implement retry logic with exponential backoff
    if (this.shouldRetry(error, options.retryCount || 0)) {
      const delay = this.calculateBackoffDelay(options.retryCount || 0);
      await this.sleep(delay);
      
      return this.request(endpoint, {
        ...options,
        retryCount: (options.retryCount || 0) + 1
      });
    }
    
    throw error;
  }
}
```

#### WebSocket Real-time Updates

```typescript
// Real-time event handling for collaboration features
class RealtimeEventManager {
  private websocket: WebSocketClient;
  private eventSubscriptions: Map<string, EventHandler[]>;
  
  public subscribe(eventType: string, handler: EventHandler): () => void {
    const handlers = this.eventSubscriptions.get(eventType) || [];
    handlers.push(handler);
    this.eventSubscriptions.set(eventType, handlers);
    
    // Return unsubscribe function
    return () => {
      const updatedHandlers = handlers.filter(h => h !== handler);
      this.eventSubscriptions.set(eventType, updatedHandlers);
    };
  }
  
  public setupCollaborationEvents(): void {
    // Comment events
    this.websocket.on('comment:added', (event: CommentEvent) => {
      this.notifySubscribers('comment:added', event);
      this.updateCommentStore(event.comment);
    });
    
    // Presence events  
    this.websocket.on('user:joined', (event: PresenceEvent) => {
      this.notifySubscribers('user:joined', event);
      this.updatePresenceStore(event.user, 'joined');
    });
    
    // Video events
    this.websocket.on('video:processing_complete', (event: VideoEvent) => {
      this.notifySubscribers('video:processing_complete', event);
      this.updateVideoStore(event.video);
      this.showProcessingCompleteNotification(event.video);
    });
  }
}
```

### Upload Management System

#### Chunked Upload Implementation

```typescript
// Robust upload system with resume capability
class ChunkedUploadManager {
  private chunkSize = 1024 * 1024; // 1MB chunks
  private maxConcurrentChunks = 3;
  private uploadQueue: UploadTask[] = [];
  
  public async uploadFile(file: File, metadata: VideoUploadMetadata): Promise<UploadResult> {
    const uploadSession = await this.createUploadSession(file, metadata);
    const chunks = this.createFileChunks(file);
    
    return new Promise((resolve, reject) => {
      const task: UploadTask = {
        id: uploadSession.id,
        file,
        chunks,
        metadata,
        progress: 0,
        uploadedChunks: new Set(),
        onProgress: (progress) => this.notifyProgress(uploadSession.id, progress),
        onComplete: resolve,
        onError: reject
      };
      
      this.uploadQueue.push(task);
      this.processUploadQueue();
    });
  }
  
  private async uploadChunk(task: UploadTask, chunkIndex: number): Promise<void> {
    const chunk = task.chunks[chunkIndex];
    const formData = new FormData();
    formData.append('chunk', chunk.blob);
    formData.append('chunkIndex', chunkIndex.toString());
    formData.append('uploadSessionId', task.id);
    
    try {
      await this.apiClient.request('/upload/chunk', {
        method: 'POST',
        body: formData,
        timeout: 30000 // 30 second timeout per chunk
      });
      
      task.uploadedChunks.add(chunkIndex);
      this.updateTaskProgress(task);
      
    } catch (error) {
      // Retry failed chunks up to 3 times
      if (chunk.retryCount < 3) {
        chunk.retryCount++;
        setTimeout(() => this.uploadChunk(task, chunkIndex), 1000 * chunk.retryCount);
      } else {
        throw error;
      }
    }
  }
}
```

### Performance Optimization Strategies

#### Code Splitting and Lazy Loading

```typescript
// Route-based code splitting with lazy loading
const AppRouter = () => {
  return (
    <Router>
      <Routes>
        {/* Immediate routes */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/auth/*" element={<AuthPages />} />
        
        {/* Lazy-loaded application routes */}
        <Route path="/dashboard" element={
          <Suspense fallback={<DashboardSkeleton />}>
            <LazyDashboard />
          </Suspense>
        } />
        
        <Route path="/projects/*" element={
          <Suspense fallback={<ProjectsSkeleton />}>
            <LazyProjects />
          </Suspense>
        } />
        
        <Route path="/editor/:videoId" element={
          <Suspense fallback={<EditorSkeleton />}>
            <LazyEditor />
          </Suspense>
        } />
      </Routes>
    </Router>
  );
};

// Dynamic imports for lazy loading
const LazyDashboard = lazy(() => import('../pages/dashboard/DashboardPage'));
const LazyProjects = lazy(() => import('../pages/projects/ProjectsPage'));  
const LazyEditor = lazy(() => import('../pages/editor/EditorPage'));
```

#### Caching and Data Management

```typescript
// Intelligent caching with invalidation strategies
class DataCacheManager {
  private cache: Map<string, CacheEntry> = new Map();
  private cacheConfig: CacheConfig = {
    // Static data - cache for 1 hour
    organizations: { ttl: 3600000, strategy: 'cache-first' },
    members: { ttl: 3600000, strategy: 'cache-first' },
    
    // Dynamic data - cache for 5 minutes with refresh
    projects: { ttl: 300000, strategy: 'stale-while-revalidate' },
    videos: { ttl: 300000, strategy: 'stale-while-revalidate' },
    
    // Real-time data - always fetch fresh
    comments: { ttl: 0, strategy: 'network-first' },
    notifications: { ttl: 0, strategy: 'network-first' }
  };
  
  public async get<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
    const config = this.getCacheConfig(key);
    const entry = this.cache.get(key);
    
    switch (config.strategy) {
      case 'cache-first':
        if (entry && !entry.isExpired()) {
          return entry.data;
        }
        return this.fetchAndCache(key, fetcher, config.ttl);
        
      case 'stale-while-revalidate':
        if (entry) {
          // Return cached data immediately
          if (!entry.isExpired()) {
            return entry.data;
          }
          
          // Refresh in background if stale
          this.refreshInBackground(key, fetcher, config.ttl);
          return entry.data;
        }
        return this.fetchAndCache(key, fetcher, config.ttl);
        
      case 'network-first':
      default:
        return fetcher();
    }
  }
}
```
## Security and Compliance

### Content Security Policy (CSP)

The application implements a strict Content Security Policy to prevent XSS attacks and unauthorized resource loading:

```typescript
// CSP configuration for production deployment
const contentSecurityPolicy = {
  "default-src": ["'self'"],
  "script-src": [
    "'self'",
    "'unsafe-inline'", // Required for Vite dev mode
    "https://api.streetstudio.com",
    "https://cdn.jsdelivr.net" // For CDN resources
  ],
  "style-src": [
    "'self'",
    "'unsafe-inline'", // Required for dynamic styling
    "https://fonts.googleapis.com"
  ],
  "img-src": [
    "'self'",
    "data:",
    "https:", // Allow HTTPS images
    "blob:" // For dynamically generated thumbnails
  ],
  "media-src": [
    "'self'",
    "https://media.streetstudio.com",
    "blob:" // For recorded video playback
  ],
  "connect-src": [
    "'self'",
    "https://api.streetstudio.com",
    "wss://ws.streetstudio.com", // WebSocket connections
    "https://upload.streetstudio.com" // Upload endpoint
  ],
  "font-src": [
    "'self'",
    "https://fonts.gstatic.com"
  ],
  "frame-src": ["'none'"], // No iframe embedding allowed
  "object-src": ["'none'"], // No plugins
  "base-uri": ["'self'"],
  "form-action": ["'self'"],
  "upgrade-insecure-requests": []
};
```

### Authentication Security

#### Token Management

```typescript
// Secure token storage and management
class SecureTokenManager {
  private static readonly TOKEN_KEY = 'streetstudio_auth_token';
  private static readonly REFRESH_KEY = 'streetstudio_refresh_token';
  
  public storeTokens(accessToken: string, refreshToken: string): void {
    // Store access token in memory only (more secure)
    this.memoryStorage.set(this.TOKEN_KEY, {
      token: accessToken,
      expiresAt: this.parseTokenExpiry(accessToken)
    });
    
    // Store refresh token in httpOnly cookie (most secure)
    document.cookie = `${this.REFRESH_KEY}=${refreshToken}; HttpOnly; Secure; SameSite=Strict; Max-Age=604800`; // 7 days
  }
  
  public async getValidAccessToken(): Promise<string | null> {
    const stored = this.memoryStorage.get(this.TOKEN_KEY);
    
    if (!stored) {
      return this.attemptTokenRefresh();
    }
    
    // Check if token is expiring soon (refresh 5 minutes early)
    const expiresIn = stored.expiresAt - Date.now();
    if (expiresIn < 300000) { // 5 minutes
      return this.attemptTokenRefresh();
    }
    
    return stored.token;
  }
  
  private async attemptTokenRefresh(): Promise<string | null> {
    try {
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include' // Include httpOnly refresh token
      });
      
      if (response.ok) {
        const { accessToken, refreshToken } = await response.json();
        this.storeTokens(accessToken, refreshToken);
        return accessToken;
      }
    } catch (error) {
      console.error('Token refresh failed:', error);
    }
    
    // Clear invalid tokens and redirect to login
    this.clearTokens();
    return null;
  }
}
```

#### Input Sanitization and Validation

```typescript
// Comprehensive input sanitization
class InputSanitizer {
  private static readonly HTML_ESCAPE_MAP: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;'
  };
  
  public sanitizeHtml(input: string): string {
    return input.replace(/[&<>"'/]/g, char => this.HTML_ESCAPE_MAP[char]);
  }
  
  public sanitizeComment(comment: string): string {
    // Allow basic formatting but escape HTML
    return this.sanitizeHtml(comment)
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // Bold
      .replace(/\*(.*?)\*/g, '<em>$1</em>') // Italic
      .replace(/`(.*?)`/g, '<code>$1</code>'); // Code
  }
  
  public validateFileUpload(file: File): ValidationResult {
    const errors: string[] = [];
    
    // Check file type whitelist
    const allowedTypes = ['video/mp4', 'video/webm', 'video/quicktime'];
    if (!allowedTypes.includes(file.type)) {
      errors.push(`File type ${file.type} is not allowed`);
    }
    
    // Check file size limits (500MB max)
    const maxSize = 500 * 1024 * 1024;
    if (file.size > maxSize) {
      errors.push(`File size exceeds maximum of ${maxSize / 1024 / 1024}MB`);
    }
    
    // Check file name for security
    if (!/^[\w\-. ]+$/.test(file.name)) {
      errors.push('File name contains invalid characters');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
}
```

### Privacy and Data Protection

#### GDPR Compliance Features

```typescript
// Privacy controls and data management
class PrivacyManager {
  public async exportUserData(userId: Uuid): Promise<UserDataExport> {
    return {
      profile: await this.getUserProfile(userId),
      videos: await this.getUserVideos(userId),
      comments: await this.getUserComments(userId),
      notifications: await this.getUserNotifications(userId),
      auditLog: await this.getUserAuditLog(userId),
      exportedAt: new Date().toISOString()
    };
  }
  
  public async deleteUserData(userId: Uuid, options: DeletionOptions): Promise<void> {
    // Soft delete by default (anonymize but retain for analytics)
    if (options.softDelete) {
      await this.anonymizeUserData(userId);
    } else {
      // Hard delete (complete removal)
      await this.hardDeleteUserData(userId);
    }
    
    // Log deletion for compliance audit
    await this.auditService.logDataDeletion({
      userId,
      deletionType: options.softDelete ? 'anonymization' : 'hard_delete',
      requestedAt: options.requestedAt,
      completedAt: new Date().toISOString()
    });
  }
  
  public getCookieConsent(): CookieConsent {
    const consent = localStorage.getItem('cookie_consent');
    return consent ? JSON.parse(consent) : {
      necessary: true, // Always true
      analytics: false,
      marketing: false,
      preferences: false
    };
  }
  
  public updateCookieConsent(consent: CookieConsent): void {
    localStorage.setItem('cookie_consent', JSON.stringify(consent));
    
    // Apply consent settings
    if (!consent.analytics) {
      this.disableAnalytics();
    }
    if (!consent.marketing) {
      this.disableMarketingTrackers();
    }
  }
}
```

## Deployment and Operations

### Build Configuration

```typescript
// Production build configuration
export default defineConfig({
  build: {
    target: 'es2020',
    minify: 'terser',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          // Vendor chunk for stable caching
          vendor: ['react', 'react-dom'],
          
          // UI components chunk
          ui: ['@streetstudio/ui'],
          
          // Dashboard logic chunk  
          dashboard: ['@streetstudio/dashboard'],
          
          // Media handling chunk
          media: ['video.js', 'hls.js']
        }
      }
    },
    
    // Performance budgets
    chunkSizeWarningLimit: 1000, // 1MB chunks
    assetsInlineLimit: 4096 // 4KB inline limit
  },
  
  // PWA configuration
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\.streetstudio\.com/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 300 // 5 minutes
              }
            }
          },
          {
            urlPattern: /^https:\/\/media\.streetstudio\.com/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'media-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 86400 // 24 hours
              }
            }
          }
        ]
      }
    })
  ]
});
```

### Monitoring and Analytics

```typescript
// Performance and error monitoring
class ApplicationMonitoring {
  private performanceObserver: PerformanceObserver;
  private errorBoundary: ErrorBoundary;
  
  public initialize(): void {
    this.setupPerformanceMonitoring();
    this.setupErrorTracking();
    this.setupUserAnalytics();
  }
  
  private setupPerformanceMonitoring(): void {
    // Core Web Vitals tracking
    new PerformanceObserver(entries => {
      entries.getEntries().forEach(entry => {
        switch (entry.entryType) {
          case 'largest-contentful-paint':
            this.trackMetric('lcp', entry.startTime);
            break;
          case 'first-input':
            this.trackMetric('fid', entry.processingStart - entry.startTime);
            break;
          case 'layout-shift':
            if (!entry.hadRecentInput) {
              this.trackMetric('cls', entry.value);
            }
            break;
        }
      });
    }).observe({ entryTypes: ['largest-contentful-paint', 'first-input', 'layout-shift'] });
    
    // Custom performance markers
    this.trackCustomTimings();
  }
  
  private trackMetric(name: string, value: number): void {
    // Send metrics to monitoring service
    if (this.isAnalyticsEnabled()) {
      fetch('/api/metrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          metric: name,
          value,
          timestamp: Date.now(),
          userId: this.getCurrentUserId(),
          sessionId: this.getSessionId()
        })
      }).catch(() => {
        // Fail silently for analytics
      });
    }
  }
}
```

This comprehensive design document provides the technical foundation for implementing the StreetStudio Web Application. The architecture emphasizes performance, security, accessibility, and maintainability while leveraging the existing StreetStudio backend services and UI component library to deliver a production-ready video collaboration platform.