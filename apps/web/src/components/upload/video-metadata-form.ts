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

    this.validator = new FormValidator({
      title: [
        ValidationRules.required('Title is required'),
        ValidationRules.minLength(1, 'Title cannot be empty'),
        ValidationRules.maxLength(255, 'Title must be 255 characters or less'),
        ValidationRules.pattern(/^[^<>{}]+$/, 'Title cannot contain < > { } characters'),
      ],
      description: [
        ValidationRules.maxLength(2000, 'Description must be 2000 characters or less'),
        ValidationRules.pattern(/^[^<>{}]*$/, 'Description cannot contain < > { } characters'),
      ],
    });

    this.initialize();
  }

  private initialize(): void {
    this.render();
    this.setupEventListeners();
    this.loadProjectsIfNeeded();
    this.loadTagsIfNeeded();
  }

  private render(): void {
    this.container.innerHTML = '';
    const form = document.createElement('form');
    form.className = 'video-metadata-form';
    form.setAttribute('novalidate', '');
    form.setAttribute('aria-label', 'Video metadata');
    form.innerHTML = this.getFormHTML();
    this.container.appendChild(form);

    this.tagInput = this.container.querySelector('#tag-input');
    this.tagSuggestionsContainer = this.container.querySelector('#tag-suggestions');
  }

  private getFormHTML(): string {
    const projectOptions = this.projects
      .map(p => `<option value="${p.id}"${p.id === this.formData.projectId ? ' selected' : ''}>${p.name}</option>`)
      .join('');

    const tagsHTML = this.formData.tags
      .map(tag => `<span class="tag-chip" data-tag="${tag}">${tag}<button type="button" class="tag-remove" aria-label="Remove tag ${tag}">&times;</button></span>`)
      .join('');

    return `
      <div class="form-group">
        <label for="video-title" class="form-label">
          Title <span class="required-indicator" aria-hidden="true">*</span>
        </label>
        <input
          type="text"
          id="video-title"
          name="title"
          class="form-input"
          value="${this.escapeHTML(this.formData.title)}"
          placeholder="Enter video title"
          required
          aria-required="true"
          maxlength="255"
        />
        <div class="field-hint" id="title-hint">
          <span class="char-count" id="title-char-count">${this.formData.title.length}/255</span>
        </div>
        <div class="field-error" id="title-error" role="alert" aria-live="polite"></div>
      </div>

      <div class="form-group">
        <label for="video-description" class="form-label">Description</label>
        <textarea
          id="video-description"
          name="description"
          class="form-input form-textarea"
          placeholder="Add a description for your video"
          maxlength="2000"
          rows="4"
        >${this.escapeHTML(this.formData.description)}</textarea>
        <div class="field-hint" id="description-hint">
          <span class="char-count" id="description-char-count">${this.formData.description.length}/2000</span>
        </div>
        <div class="field-error" id="description-error" role="alert" aria-live="polite"></div>
      </div>

      <div class="form-group">
        <label for="video-project" class="form-label">Project</label>
        <select id="video-project" name="projectId" class="form-input form-select">
          <option value="">No project</option>
          ${projectOptions}
        </select>
        <div class="field-hint">Assign this video to a project for better organization</div>
      </div>

      <div class="form-group">
        <label for="tag-input" class="form-label">Tags</label>
        <div class="tag-input-container" id="tag-input-wrapper">
          <div class="tags-display" id="tags-display">${tagsHTML}</div>
          <input
            type="text"
            id="tag-input"
            class="tag-text-input"
            placeholder="${this.formData.tags.length > 0 ? '' : 'Add tags...'}"
            autocomplete="off"
            aria-label="Add tags"
            aria-describedby="tag-hint"
            aria-expanded="false"
            aria-controls="tag-suggestions"
            role="combobox"
          />
          <div class="tag-suggestions" id="tag-suggestions" role="listbox" aria-label="Tag suggestions"></div>
        </div>
        <div class="field-hint" id="tag-hint">Press Enter or comma to add a tag. Type to search existing tags.</div>
      </div>

      <fieldset class="form-group form-fieldset">
        <legend class="form-label">Privacy</legend>
        <div class="toggle-group">
          <label class="toggle-label" for="video-private">
            <input
              type="checkbox"
              id="video-private"
              name="isPrivate"
              class="toggle-input"
              ${this.formData.isPrivate ? 'checked' : ''}
              role="switch"
              aria-checked="${this.formData.isPrivate}"
            />
            <span class="toggle-switch"></span>
            <span class="toggle-text">Private video</span>
          </label>
          <div class="field-hint">Private videos are only visible to you and people you share them with</div>
        </div>
      </fieldset>
