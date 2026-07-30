/**
 * Error Handling Services
 * 
 * Comprehensive error handling and recovery system including:
 * - Network error handler with retry logic and backoff
 * - Graceful degradation for feature unavailability
 * - User feedback collection for error reporting
 * - Contextual help and support contact integration
 * 
 * Implements Requirements 13.2, 13.3, 13.7, 13.8.
 */

export {
  NetworkErrorHandler,
  initializeNetworkErrorHandler,
  getNetworkErrorHandler,
  type NetworkErrorCategory,
  type RetryConfig,
  type NetworkErrorInfo,
  type NetworkErrorHandlerConfig,
} from './network-error-handler.js';

export {
  GracefulDegradationService,
  initializeGracefulDegradation,
  getGracefulDegradationService,
  type FeatureStatus,
  type FeatureCheck,
  type FeatureState,
  type GracefulDegradationConfig,
} from './graceful-degradation.js';

export {
  ErrorFeedbackService,
  initializeErrorFeedback,
  getErrorFeedbackService,
  type ErrorContext,
  type BrowserInfo,
  type FeedbackReport,
  type FeedbackFormConfig,
} from './error-feedback.js';

export {
  ContextualHelpService,
  initializeContextualHelp,
  getContextualHelpService,
  type HelpArticle,
  type SupportContact,
  type ContextualTip,
  type ContextualHelpConfig,
} from './contextual-help.js';
