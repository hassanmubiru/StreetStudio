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