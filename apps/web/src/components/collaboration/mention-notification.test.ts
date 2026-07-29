/**
 * Unit tests for Mention Autocomplete, Notification Delivery,
 * Notification Preferences, and Notification Center.
 *
 * Requirements: 5.7, 7.6
 */

// @vitest-environment jsdom

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  extractMentionQuery,
  insertMentionIntoText,
  filterCandidates,
  extractMentionsFromText,
  MentionAutocomplete,
} from './mention-autocomplete';
import type { MentionCandidate } from './mention-autocomplete';
