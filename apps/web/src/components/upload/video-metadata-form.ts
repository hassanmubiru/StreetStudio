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

export class VideoMetadataForm {
  private container: HTMLElement;
  private config: Required<VideoMetadataFormConfig>;
  private formData: VideoMetadataFormData;
  private validator: FormValidator;
  private tagInput: HTMLInputElement | null = null;
  private tagSuggestionsContainer: HTMLElement | null = null;
  private activeSuggestionIndex = -1;
  private availableTags: TagSuggestion[] = [];
  private projects: ProjectOption[] = [];
  private validationErrors: Record<string, string[]> = {};

  private readonly DEFAULT_CONFIG: Required<VideoMetadataFormConfig> = {
    initialData: {},
    projects: [],
    existingTags: [],
    showDeveloperMode: true,
    onSubmit: () => {},
    onChange: () => {},
    autoSave: false,
  };

  constructor(container: HTMLElement, config: VideoMetadataFormConfig = {}) {
    this.container = container;
    this.config = { ...this.DEFAULT_CONFIG, ...config } as Required<VideoMetadataFormConfig>;
    this.projects = this.config.projects;
    this.availableTags = this.config.existingTags;

    this.formData = {
      title: this.config.initialData.title || '',
      description: this.config.initialData.description || '',
      projectId: this.config.initialData.projectId || null,
      folderId: this.config.initialData.folderId || null,
      tags: this.config.initialData.tags || [],
      isPrivate: this.config.initialData.isPrivate ?? false,
      developerMode: this.config.initialData.developerMode ?? false,
    };
