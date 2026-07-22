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