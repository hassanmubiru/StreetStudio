# Implementation Plan: StreetStudio Web Application

## Overview

This implementation plan transforms the complete StreetStudio Web Application design into a series of actionable coding tasks. The web application is a comprehensive Single Page Application (SPA) built with TypeScript that provides the primary user interface for video recording, reviewing, editing, and collaboration. It builds upon the existing foundation of UI components (`@streetstudio/ui`) and business logic (`@streetstudio/dashboard`) to deliver a complete production experience.

The implementation focuses on creating a modern, accessible, and performant web client that consumes StreetStudio backend services through published packages and APIs. Each task builds incrementally toward a fully functional application with robust error handling, real-time collaboration features, and comprehensive testing.

## Tasks

- [ ] 1. Application Infrastructure and Core Systems
  - [-] 1.1 Complete router implementation with route guards and lazy loading
    - Implement protected routes with authentication checks
    - Add code splitting for route-based modules
    - Create route transition animations and loading states
    - Set up 404 handling and error boundary integration
    - _Requirements: 2.2, 2.8, 12.2_

  - [~] 1.2 Write property tests for router navigation system
    - **Property 3: Keyboard Navigation Universality**
    - **Validates: Requirements 2.2**

  - [-] 1.3 Implement comprehensive error boundary system
    - Create global error boundary with categorized error handling (fatal, recoverable, minor)
    - Implement error reporting with user consent and context capture
    - Add graceful degradation for non-critical feature failures
    - Set up client-side error logging and retry mechanisms
    - _Requirements: 13.1, 13.2, 13.6, 13.8_

  - [~] 1.4 Write property tests for error handling resilience
    - **Property 10: Error Handling Resilience**
    - **Validates: Requirements 13.1**

  - [x] 1.5 Implement keyboard shortcuts system
    - Create global keyboard shortcut manager with conflict resolution
    - Add accessibility support with visual indicators and help overlay
    - Implement context-sensitive shortcuts for different application states
    - _Requirements: 11.1, 11.2_

  - [~] 1.6 Write property tests for keyboard accessibility
    - **Property 9: Universal Keyboard Accessibility**
    - **Validates: Requirements 11.1**

- [ ] 2. Authentication System Implementation
  - [~] 2.1 Create authentication pages and forms
    - Implement login page with email/password fields and remember me option
    - Create registration form with email, password, confirm password, and terms acceptance
    - Build password reset request and reset password pages
    - Add OAuth provider buttons with dynamic configuration
    - _Requirements: 1.1, 1.4, 1.5, 1.6_

  - [~] 2.2 Implement authentication controller and session management
    - Build secure token storage with memory and httpOnly cookie strategy
    - Create automatic token refresh with early renewal logic
    - Implement authentication state management with reactive updates
    - Add session validation and cleanup on logout
    - _Requirements: 1.2, 1.8, 1.9_

  - [~] 2.3 Write property tests for authentication security
    - **Property 1: Authentication Security Consistency**
    - **Validates: Requirements 1.3**
    
  - [~] 2.4 Write property tests for password reset security
    - **Property 2: Password Reset Security Uniformity**
    - **Validates: Requirements 1.5**

  - [~] 2.5 Add OAuth and SSO integration handlers
    - Implement OAuth redirect flow handling for configured providers
    - Create SSO authentication flow with proper state management
    - Add provider-specific error handling and user guidance
    - _Requirements: 1.6, 1.7_

  - [~] 2.6 Write unit tests for authentication flows
    - Test login/logout scenarios and session persistence
    - Test OAuth callback handling and error states
    - Test token refresh and expiration scenarios
    - _Requirements: 1.2, 1.6, 1.7_

- [ ] 3. Dashboard and Navigation Implementation
  - [~] 3.1 Build main dashboard interface
    - Create dashboard layout with recent projects, videos, and activity widgets
    - Implement responsive project cards with thumbnails and metadata display
    - Add quick action buttons for new recordings and project creation
    - Build activity feed with real-time updates and pagination
    - _Requirements: 2.1, 2.5, 2.6, 2.7_

  - [~] 3.2 Implement navigation system and layout controllers
    - Create top navigation bar with organization switcher and user menu
    - Build sidebar navigation with contextual menu items and breadcrumbs
    - Implement responsive navigation with hamburger menu for mobile
    - Add navigation state persistence and deep link support
    - _Requirements: 2.2, 2.3, 2.4, 2.8, 10.3_

  - [~] 3.3 Write property tests for navigation consistency
    - **Property 3: Keyboard Navigation Universality**
    - **Validates: Requirements 2.2**

  - [~] 3.4 Create workspace and organization management
    - Implement organization switcher with permission-based filtering
    - Build workspace context management with state synchronization
    - Add breadcrumb navigation for deep application states
    - _Requirements: 2.4, 8.1_

  - [~] 3.5 Write unit tests for dashboard components
    - Test dashboard widget rendering and data loading
    - Test navigation state management and context switching
    - Test responsive layout behavior across breakpoints
    - _Requirements: 2.1, 2.3, 10.1_

- [ ] 4. Recording Interface Implementation
  - [~] 4.1 Build browser recording interface
    - Create screen/window/tab selection interface with preview thumbnails
    - Implement floating recording control panel with accessible positioning
    - Add real-time recording indicator with elapsed time display
    - Build cursor highlighting options with customizable colors and effects
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [~] 4.2 Write property tests for recording controls accessibility
    - **Property 4: Recording Control Accessibility**
    - **Validates: Requirements 3.2**

  - [~] 4.3 Implement drawing and annotation tools
    - Create drawing overlay system with pen, highlighter, arrow, and text tools
    - Build real-time drawing synchronization with recording capture
    - Add undo/redo functionality for drawing operations
    - Implement drawing tool persistence across recording sessions
    - _Requirements: 3.5_

  - [~] 4.4 Create recording state management and controls
    - Implement record/pause/stop functionality with state transitions
    - Add keyboard shortcuts for recording control (space, esc, etc.)
    - Build recording session persistence for interrupted recordings
    - Create permission handling with clear user guidance
    - _Requirements: 3.3, 3.6, 3.10_

  - [~] 4.5 Write unit tests for recording functionality
    - Test screen capture initialization and permission handling
    - Test recording control state transitions and keyboard shortcuts
    - Test drawing tool functionality and overlay rendering
    - _Requirements: 3.1, 3.4, 3.5_

- [ ] 5. Upload System Implementation
  - [~] 5.1 Build chunked upload manager
    - Implement chunked file upload with configurable chunk size
    - Create upload queue management with concurrent upload limits
    - Add automatic retry logic with exponential backoff for failed chunks
    - Build upload resume capability for interrupted transfers
    - _Requirements: 3.7, 3.8, 13.5_

  - [~] 5.2 Create upload progress interface
    - Build upload progress visualization with individual file and batch progress
    - Implement background uploading with notification on completion
    - Add upload speed calculation and estimated completion time display
    - Create upload error handling with clear user messaging
    - _Requirements: 3.7, 3.8, 3.9_

  - [~] 5.3 Implement video metadata collection
    - Create metadata form for title, description, and project assignment
    - Add tag input with autocomplete from existing tags
    - Implement privacy settings and developer mode options
    - Build form validation with client-side checks
    - _Requirements: 3.9, 4.4_

  - [~] 5.4 Write unit tests for upload system
    - Test chunked upload logic and retry mechanisms
    - Test upload progress tracking and state management
    - Test metadata form validation and submission
    - _Requirements: 3.7, 3.8, 3.9_

- [ ] 6. Video Management and Organization
  - [~] 6.1 Build project management interface
    - Create projects page with searchable and filterable grid layout
    - Implement project creation form with member invitation
    - Build project detail view with hierarchical folder structure
    - Add drag-and-drop organization with real-time updates
    - _Requirements: 4.1, 4.2, 4.4, 4.6_

  - [~] 6.2 Write property tests for project organization
    - **Property 5: Project Organization Consistency**
    - **Validates: Requirements 4.2**

  - [~] 6.3 Implement video library interface
    - Create multiple view layouts (list, grid, timeline) with user preferences
    - Build sorting and filtering options by date, name, duration, activity
    - Implement bulk operations with batch selection and actions
    - Add video metadata display with processing status indicators
    - _Requirements: 4.3, 4.7, 4.9, 4.10_

  - [~] 6.4 Create folder management system
    - Implement folder creation, renaming, and nesting up to 10 levels
    - Build visual hierarchy indicators with expand/collapse functionality
    - Add folder permissions and access control display
    - Create folder navigation breadcrumbs and quick access
    - _Requirements: 4.5_

  - [~] 6.5 Write unit tests for video management
    - Test project creation and member invitation workflows
    - Test video organization and bulk operations
    - Test folder management and hierarchy display
    - _Requirements: 4.1, 4.4, 4.5_

- [ ] 7. Video Player and Playback System
  - [~] 7.1 Implement adaptive video player
    - Build HTML5 video player with adaptive bitrate streaming
    - Create standard playback controls (play, pause, seek, volume, speed)
    - Add keyboard shortcuts for all playback functions
    - Implement picture-in-picture and fullscreen modes
    - _Requirements: 5.1, 5.2, 5.3_

  - [~] 7.2 Add video information and metadata display
    - Create video information panel with title, description, and metadata
    - Implement quality selection controls with automatic adaptation
    - Add playback position memory and auto-resume functionality
    - Build caption and transcript toggle controls
    - _Requirements: 5.4, 5.9, 5.10_

  - [~] 7.3 Implement timeline and seeking functionality
    - Create frame-accurate timeline with zoom controls
    - Build precise playback position indicator and scrubbing
    - Add timeline markers for comments and annotations
    - Implement jump-to-timestamp from transcript search
    - _Requirements: 5.3, 5.10, 6.1_

  - [~] 7.4 Write property tests for timeline accuracy
    - **Property 6: Timeline Frame Accuracy**
    - **Validates: Requirements 6.1**

  - [~] 7.5 Write unit tests for video player
    - Test playback controls and keyboard shortcuts
    - Test adaptive quality selection and streaming
    - Test timeline seeking and position memory
    - _Requirements: 5.1, 5.2, 5.3_

- [ ] 8. Comment and Collaboration System
  - [~] 8.1 Build comment system interface
    - Create timestamped comment input with timeline integration
    - Implement threaded comment display with proper nesting
    - Add comment markers on timeline with click-to-seek functionality
    - Build comment moderation tools for organization admins
    - _Requirements: 5.5, 5.6, 7.5_

  - [~] 8.2 Implement mention and notification system
    - Create @mention autocomplete with organization member search
    - Build mention notification delivery and tracking
    - Add notification preferences and delivery controls
    - Implement notification center with mark as read functionality
    - _Requirements: 5.7, 7.6_

  - [~] 8.3 Create reaction system
    - Implement reaction buttons (like, helpful, unclear) for videos and comments
    - Build real-time reaction count updates and display
    - Add custom reaction types for organization customization
    - Create reaction aggregation and analytics display
    - _Requirements: 5.8_

  - [~] 8.4 Build real-time collaboration features
    - Implement presence indicators with user avatars and status
    - Create typing indicators for active comment composition
    - Add collaborative viewing mode with synchronized playback
    - Build activity feed with real-time updates and notifications
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.8, 7.9_

  - [~] 8.5 Write property tests for collaboration presence
    - **Property 7: Collaboration Presence Reliability**
    - **Validates: Requirements 7.1**

  - [~] 8.6 Write unit tests for comment system
    - Test comment creation, threading, and display
    - Test mention functionality and notification delivery
    - Test reaction system and real-time updates
    - _Requirements: 5.5, 5.6, 5.7, 5.8_

- [ ] 9. Timeline Video Editor Implementation
  - [~] 9.1 Build timeline editor interface
    - Create frame-accurate timeline with zoom and navigation controls
    - Implement trim tools with draggable in/out point handles
    - Add split functionality at playhead position with preview
    - Build audio waveform visualization for audio-visual sync
    - _Requirements: 6.1, 6.2, 6.3, 6.9_

  - [~] 9.2 Write property tests for timeline frame accuracy
    - **Property 6: Timeline Frame Accuracy**
    - **Validates: Requirements 6.1**

  - [~] 9.3 Implement text overlay and caption editing
    - Create text overlay tools with font, color, and positioning controls
    - Build caption editing interface with speech-to-text integration
    - Add timing controls for text and caption synchronization
    - Implement caption styling and accessibility compliance
    - _Requirements: 6.4, 6.5_

  - [~] 9.4 Create editing preview and export system
    - Build real-time preview system without affecting original video
    - Implement multiple quality export options with progress tracking
    - Add background processing integration with status updates
    - Create export history and download management
    - _Requirements: 6.6, 6.7_

  - [~] 9.5 Add collaborative editing features
    - Implement presence indicators in timeline editor
    - Create edit conflict detection and resolution
    - Add collaborative editing session management
    - Build edit history and version control display
    - _Requirements: 6.10_

  - [~] 9.6 Write unit tests for timeline editor
    - Test timeline navigation and frame accuracy
    - Test trim, split, and editing operations
    - Test text overlay and caption functionality
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [ ] 10. Organization Management Interface
  - [~] 10.1 Build member management interface
    - Create members page with role display and last activity
    - Implement member invitation form with role selection
    - Build member profile pages with activity history
    - Add member removal with confirmation and content handling
    - _Requirements: 8.1, 8.2, 8.8_

  - [~] 10.2 Implement role and permission management
    - Create role management interface with permission matrix display
    - Build custom permission configuration for advanced users
    - Add team creation and member assignment interface
    - Implement permission inheritance and override controls
    - _Requirements: 8.3, 8.4, 8.5_

  - [~] 10.3 Create organization settings and configuration
    - Build branding customization interface with logo and color uploads
    - Implement security policy configuration with compliance controls
    - Add storage preferences and quota management display
    - Create integration configuration for third-party services
    - _Requirements: 8.6, 8.10_

  - [~] 10.4 Add billing and subscription management
    - Create billing information display with usage metrics
    - Implement payment method management for paid features
    - Build subscription upgrade/downgrade workflows
    - Add billing history and invoice download functionality
    - _Requirements: 8.7_

  - [~] 10.5 Write unit tests for organization management
    - Test member invitation and role assignment
    - Test permission configuration and team management
    - Test organization settings and billing interfaces
    - _Requirements: 8.1, 8.3, 8.6_

- [ ] 11. Settings and Profile Management
  - [~] 11.1 Build user profile settings
    - Create profile page with avatar upload and display name editing
    - Implement bio editing with character limits and formatting
    - Add timezone selection with automatic detection option
    - Build notification preference controls with granular categories
    - _Requirements: 9.1, 9.3_

  - [~] 11.2 Implement security settings
    - Create password change interface with strength validation
    - Build two-factor authentication setup with QR code generation
    - Add active session management with device information display
    - Implement login history with suspicious activity alerts
    - _Requirements: 9.2, 9.6_

  - [~] 11.3 Create accessibility and preference settings
    - Build accessibility preference controls (high contrast, reduced motion)
    - Implement screen reader optimization settings
    - Add keyboard navigation preference configuration
    - Create theme selection (light, dark, system) with preview
    - _Requirements: 9.4, 9.8, 11.4, 11.7_

  - [~] 11.4 Add privacy and data management controls
    - Create privacy settings with profile visibility controls
    - Build data export functionality with progress tracking
    - Implement data deletion options with confirmation workflows
    - Add activity sharing preferences and history controls
    - _Requirements: 9.5, 9.9_

  - [~] 11.5 Write unit tests for settings management
    - Test profile editing and preference updates
    - Test security settings and two-factor authentication
    - Test accessibility preferences and theme selection
    - _Requirements: 9.1, 9.2, 9.4_

- [ ] 12. Search and Discovery Implementation
  - [~] 12.1 Build global search interface
    - Create global search modal accessible via Cmd/Ctrl+K shortcut
    - Implement instant search with real-time results as users type
    - Add search autocomplete with recent searches and suggestions
    - Build search result display with previews and contextual information
    - _Requirements: 14.1, 14.3, 14.5_

  - [~] 12.2 Write property tests for search functionality
    - **Property 11: Search Functionality Consistency**
    - **Validates: Requirements 14.1**

  - [~] 12.3 Implement advanced search and filtering
    - Create advanced search interface with multiple filter options
    - Build date range, content type, and creator filters
    - Add faceted search with dynamic filter options
    - Implement saved searches with bookmark functionality
    - _Requirements: 14.2, 14.7, 14.8_

  - [~] 12.4 Add content-specific search features
    - Implement transcript search within videos with timestamp navigation
    - Create project-scoped and organization-wide search options
    - Build natural language and semantic search capabilities
    - Add search result highlighting and context display
    - _Requirements: 14.4, 14.6, 14.9_

  - [~] 12.5 Create search discovery and recommendations
    - Build "no results" page with alternative suggestions
    - Implement content discovery recommendations
    - Add popular content and trending search displays
    - Create search analytics and improvement suggestions
    - _Requirements: 14.10_

  - [~] 12.6 Write unit tests for search functionality
    - Test global search activation and result display
    - Test advanced filtering and faceted search
    - Test transcript search and content-specific features
    - _Requirements: 14.1, 14.2, 14.4_

- [ ] 13. Mobile Responsive Implementation
  - [~] 13.1 Implement responsive layouts and breakpoints
    - Create mobile-first responsive design system with appropriate breakpoints
    - Build adaptive layouts that scale from 320px to desktop resolution
    - Implement touch-friendly controls with 44px minimum touch targets
    - Add responsive navigation with slide-out menu and breadcrumb optimization
    - _Requirements: 10.1, 10.2, 10.3_

  - [~] 13.2 Write property tests for responsive adaptation
    - **Property 8: Responsive Layout Adaptation**
    - **Validates: Requirements 10.1**

  - [~] 13.3 Build mobile-optimized interfaces
    - Create mobile-optimized video player with appropriate controls
    - Implement touch gestures for video seeking and navigation
    - Build mobile comment composition with touch keyboard optimization
    - Add swipe gestures for common actions (delete, archive, etc.)
    - _Requirements: 10.4, 10.5_

  - [~] 13.4 Implement mobile-specific features
    - Add pull-to-refresh functionality for content lists
    - Build camera access integration for mobile uploads
    - Implement photo library integration with upload flow
    - Create mobile notifications with permission handling
    - _Requirements: 10.6, 10.7, 10.8, 10.9_

  - [~] 13.5 Add offline capabilities
    - Implement service worker for offline functionality
    - Create local storage for recently viewed content
    - Build offline comment composition with sync when online
    - Add connectivity status display and offline indicators
    - _Requirements: 10.7_

  - [~] 13.6 Write unit tests for mobile functionality
    - Test responsive layout behavior across breakpoints
    - Test touch gestures and mobile-specific interactions
    - Test offline capabilities and background sync
    - _Requirements: 10.1, 10.2, 10.6_

- [ ] 14. Performance Optimization Implementation
  - [~] 14.1 Implement code splitting and lazy loading
    - Set up route-based code splitting with dynamic imports
    - Create lazy loading for heavy components (editor, player)
    - Implement skeleton screens for loading states
    - Build progressive loading for images and media content
    - _Requirements: 12.2, 12.5_

  - [~] 14.2 Build caching and data management system
    - Implement intelligent caching with cache-first and network-first strategies
    - Create cache invalidation logic for real-time data
    - Build local storage management for user preferences
    - Add background sync for offline actions and updates
    - _Requirements: 12.3, 12.6_

  - [~] 14.3 Implement performance monitoring
    - Create Core Web Vitals tracking (LCP, FID, CLS)
    - Build custom performance metrics for video operations
    - Add performance budgets and monitoring alerts
    - Implement user experience metrics and analytics
    - _Requirements: 12.7_

  - [~] 14.4 Optimize media handling and streaming
    - Implement adaptive bitrate streaming for video playback
    - Create progressive image loading with WebP support
    - Build memory management for long-running video sessions
    - Add compression and optimization for uploaded content
    - _Requirements: 12.4, 12.8, 12.9_

  - [~] 14.5 Write unit tests for performance optimizations
    - Test code splitting and lazy loading behavior
    - Test caching strategies and cache invalidation
    - Test media optimization and adaptive streaming
    - _Requirements: 12.2, 12.3, 12.4_

- [ ] 15. Integration and API Management
  - [~] 15.1 Build API key management interface
    - Create API key generation interface with scope selection
    - Implement API key display with partial masking for security
    - Build key revocation and rotation functionality
    - Add usage analytics and rate limiting display
    - _Requirements: 15.1_

  - [~] 15.2 Write property tests for API key management
    - **Property 12: API Key Management Reliability**
    - **Validates: Requirements 15.1**

  - [~] 15.3 Implement webhook configuration
    - Create webhook endpoint management interface
    - Build event selection and filtering options
    - Add delivery status monitoring and retry configuration
    - Implement webhook testing and validation tools
    - _Requirements: 15.2_

  - [~] 15.4 Build export and sharing functionality
    - Create video export interface with format selection
    - Implement batch export with progress tracking
    - Build embed code generation with player customization
    - Add sharing controls with permission management
    - _Requirements: 15.3, 15.5_

  - [~] 15.5 Add third-party integrations
    - Implement calendar integration for recording scheduling
    - Build Slack/Teams notification and sharing integration
    - Create browser extension communication interface
    - Add data import functionality from other platforms
    - _Requirements: 15.4, 15.6, 15.7, 15.9_

  - [~] 15.6 Write unit tests for integrations
    - Test API key generation and management
    - Test webhook configuration and delivery monitoring
    - Test export functionality and embed code generation
    - _Requirements: 15.1, 15.2, 15.3_

- [ ] 16. Final Integration and Polish
  - [~] 16.1 Implement comprehensive accessibility compliance
    - Add ARIA labels and roles throughout the application
    - Create skip links and landmark navigation
    - Implement proper heading structure and screen reader announcements
    - Add high contrast mode and color accessibility compliance
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_

  - [~] 16.2 Build notification and real-time update system
    - Implement WebSocket connection management with reconnection logic
    - Create notification delivery system with rate limiting
    - Build real-time collaboration synchronization
    - Add push notification support for engagement
    - _Requirements: 7.2, 7.9, 7.10_

  - [~] 16.3 Add final error handling and recovery
    - Implement comprehensive network error handling with retry logic
    - Create graceful degradation for feature unavailability
    - Build user feedback collection for error reporting
    - Add contextual help and support contact integration
    - _Requirements: 13.2, 13.3, 13.7, 13.8_

  - [~] 16.4 Implement security and compliance features
    - Add Content Security Policy implementation
    - Create input sanitization and XSS prevention
    - Implement GDPR compliance with privacy controls
    - Build audit logging for administrative actions
    - _Requirements: 8.9, 9.5, 13.9_

  - [~] 16.5 Write comprehensive integration tests
    - Test end-to-end user workflows (signup to video collaboration)
    - Test cross-browser compatibility and responsive behavior
    - Test accessibility compliance with screen readers
    - Test performance benchmarks and load handling
    - _Requirements: 10.1, 11.1, 12.1_

- [~] 17. Final Checkpoint - Complete Application Testing
  - Ensure all tests pass, verify accessibility compliance, and validate performance metrics
  - Conduct end-to-end testing across browsers and devices
  - Verify real-time collaboration features work correctly
  - Ask the user if any adjustments are needed before deployment

## Notes

- Tasks marked with `*` are optional property-based and unit tests that can be skipped for faster MVP delivery
- Each task references specific requirements for traceability and validation
- Property tests validate universal correctness properties using fast-check library with minimum 100 iterations
- Unit tests validate specific examples, edge cases, and integration scenarios
- The implementation builds incrementally on the existing foundation (`@streetstudio/ui`, `@streetstudio/dashboard`)
- All tasks focus on production-ready code without placeholders or mocks
- Real-time collaboration features require WebSocket integration with the backend services
- Accessibility compliance follows WCAG AA standards throughout all interfaces
- Performance optimization includes Core Web Vitals tracking and optimization
- Security implementation follows Charter-compliant architecture patterns

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.3", "1.5"] },
    { "id": 1, "tasks": ["1.2", "1.4", "1.6", "2.1"] },
    { "id": 2, "tasks": ["2.2", "2.5", "3.1", "3.2"] },
    { "id": 3, "tasks": ["2.3", "2.4", "2.6", "3.3", "3.4", "3.5"] },
    { "id": 4, "tasks": ["4.1", "4.3", "6.1", "6.3"] },
    { "id": 5, "tasks": ["4.2", "4.4", "4.5", "5.1", "6.2", "6.4", "6.5"] },
    { "id": 6, "tasks": ["5.2", "5.3", "5.4", "7.1"] },
    { "id": 7, "tasks": ["7.2", "7.3", "8.1", "9.1"] },
    { "id": 8, "tasks": ["7.4", "7.5", "8.2", "8.3", "9.2", "9.3"] },
    { "id": 9, "tasks": ["8.4", "8.5", "8.6", "9.4", "9.5", "9.6"] },
    { "id": 10, "tasks": ["10.1", "10.2", "11.1", "12.1"] },
    { "id": 11, "tasks": ["10.3", "10.4", "10.5", "11.2", "11.3", "12.2", "12.3"] },
    { "id": 12, "tasks": ["11.4", "11.5", "12.4", "12.5", "12.6", "13.1"] },
    { "id": 13, "tasks": ["13.2", "13.3", "13.4", "14.1"] },
    { "id": 14, "tasks": ["13.5", "13.6", "14.2", "14.3", "15.1"] },
    { "id": 15, "tasks": ["14.4", "14.5", "15.2", "15.3", "15.4"] },
    { "id": 16, "tasks": ["15.5", "15.6", "16.1", "16.2"] },
    { "id": 17, "tasks": ["16.3", "16.4", "16.5"] }
  ]
}
```