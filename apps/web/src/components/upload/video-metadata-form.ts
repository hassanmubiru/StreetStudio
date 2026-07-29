/**
 * Video Metadata Form Component
 * 
 * Collects video metadata during/after upload including title, description,
 * project assignment, tags with autocomplete, privacy settings, and developer mode.
 * 
 * Implements Requirements 3.9 and 4.4.
 */

import type { Uuid } from '@streetstudio/shared';
import { FormValidator, ValidationRules, type ValidationResult } from '../../utils/validation.js';
import { apiClient } from '../../services/api.js';
import { logger } from '../../app/client-logger.js';

export interface VideoMetadataFormData {
  title: string;
  description: string;
  projectId: Uuid | null;
  folderId: Uuid | null;
  tags: string[];
  isPrivate: boolean;
  developerMode: boolean;
}

export interface ProjectOption {
  id: Uuid;
  name: string;
}

export interface TagSuggestion {
  name: string;
  count: number;
}

export interface VideoMetadataFormConfig {
  initialData?: Partial<VideoMetadataFormData>;
  projects?: ProjectOption[];
  existingTags?: TagSuggestion[];
  showDeveloperMode?: boolean;
  onSubmit?: (data: VideoMetadataFormData) => void;
  onChange?: (data: VideoMetadataFormData) => void;
  autoSave?: boolean;
}
