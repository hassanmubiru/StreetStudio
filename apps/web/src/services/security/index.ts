/**
 * Security and Compliance Services
 *
 * Provides Content Security Policy, input sanitization, GDPR compliance,
 * and audit logging for administrative actions.
 *
 * Requirements: 8.9, 9.5, 13.9
 */

export {
  ContentSecurityPolicy,
  generateNonce,
  type CspConfig,
  type CspDirective,
  type CspViolationReport,
  type CspViolationHandler,
} from './content-security-policy.js';

export {
  sanitizeHtml,
  stripHtmlTags,
  escapeHtml,
  escapeJsString,
  sanitizeUrl,
  sanitizeTextInput,
  sanitizeClassName,
  safeHtml,
  type SanitizerConfig,
} from './input-sanitizer.js';

export {
  AuditLogger,
  type AuditAction,
  type AuditLogEntry,
  type AuditLoggerConfig,
} from './audit-logger.js';

export {
  GdprComplianceService,
  type ConsentCategory,
  type ConsentStatus,
  type ConsentPreferences,
  type DataRequest,
  type DataRequestType,
  type DataRequestStatus,
  type PrivacyPreferences,
  type GdprComplianceConfig,
} from './gdpr-compliance.js';
