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

      ${this.config.showDeveloperMode ? `
      <fieldset class="form-group form-fieldset">
        <legend class="form-label">Developer Options</legend>
        <div class="toggle-group">
          <label class="toggle-label" for="video-developer-mode">
            <input
              type="checkbox"
              id="video-developer-mode"
              name="developerMode"
              class="toggle-input"
              ${this.formData.developerMode ? 'checked' : ''}
              role="switch"
              aria-checked="${this.formData.developerMode}"
            />
            <span class="toggle-switch"></span>
            <span class="toggle-text">Developer mode</span>
          </label>
          <div class="field-hint">Enable code-related features like syntax highlighting in annotations</div>
        </div>
      </fieldset>
      ` : ''}

      <div class="form-actions">
        <button type="submit" class="btn-primary form-submit" id="submit-metadata">
          Save Metadata
        </button>
      </div>
    `;
  }

  private setupEventListeners(): void {
    const form = this.container.querySelector('form');
    if (!form) return;

    // Form submission
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleSubmit();
    });

    // Title input
    const titleInput = this.container.querySelector('#video-title') as HTMLInputElement;
    titleInput?.addEventListener('input', (e) => {
      const value = (e.target as HTMLInputElement).value;
      this.formData.title = value;
      this.updateCharCount('title', value.length, 255);
      this.validateField('title', value);
      this.notifyChange();
    });

    // Description input
    const descInput = this.container.querySelector('#video-description') as HTMLTextAreaElement;
    descInput?.addEventListener('input', (e) => {
      const value = (e.target as HTMLTextAreaElement).value;
      this.formData.description = value;
      this.updateCharCount('description', value.length, 2000);
      this.validateField('description', value);
      this.notifyChange();
    });

    // Project selection
    const projectSelect = this.container.querySelector('#video-project') as HTMLSelectElement;
    projectSelect?.addEventListener('change', (e) => {
      const value = (e.target as HTMLSelectElement).value;
      this.formData.projectId = value ? value as Uuid : null;
      this.notifyChange();
    });

    // Privacy toggle
    const privateCheckbox = this.container.querySelector('#video-private') as HTMLInputElement;
    privateCheckbox?.addEventListener('change', (e) => {
      this.formData.isPrivate = (e.target as HTMLInputElement).checked;
      privateCheckbox.setAttribute('aria-checked', String(this.formData.isPrivate));
      this.notifyChange();
    });

    // Developer mode toggle
    const devModeCheckbox = this.container.querySelector('#video-developer-mode') as HTMLInputElement;
    devModeCheckbox?.addEventListener('change', (e) => {
      this.formData.developerMode = (e.target as HTMLInputElement).checked;
      devModeCheckbox.setAttribute('aria-checked', String(this.formData.developerMode));
      this.notifyChange();
    });

    // Tag input
    this.setupTagInput();
  }

  private setupTagInput(): void {
    if (!this.tagInput) return;

    this.tagInput.addEventListener('input', () => {
      this.handleTagInputChange();
    });

    this.tagInput.addEventListener('keydown', (e) => {
      this.handleTagKeydown(e);
    });

    this.tagInput.addEventListener('focus', () => {
      if (this.tagInput!.value.length > 0) {
        this.showTagSuggestions(this.tagInput!.value);
      }
    });

    this.tagInput.addEventListener('blur', () => {
      // Delay hiding to allow click on suggestion
      setTimeout(() => this.hideTagSuggestions(), 200);
    });

    // Tag remove buttons via event delegation
    const tagsDisplay = this.container.querySelector('#tags-display');
    tagsDisplay?.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('tag-remove')) {
        const chip = target.closest('.tag-chip') as HTMLElement;
        const tag = chip?.dataset.tag;
        if (tag) {
          this.removeTag(tag);
        }
      }
    });
  }

  private handleTagInputChange(): void {
    const value = this.tagInput!.value.trim();

    if (value.length > 0) {
      this.showTagSuggestions(value);
    } else {
      this.hideTagSuggestions();
    }
  }

  private handleTagKeydown(e: KeyboardEvent): void {
    const value = this.tagInput!.value.trim();

    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (this.activeSuggestionIndex >= 0) {
        this.selectActiveSuggestion();
      } else if (value.length > 0) {
        this.addTag(value);
      }
    } else if (e.key === 'Backspace' && value === '' && this.formData.tags.length > 0) {
      this.removeTag(this.formData.tags[this.formData.tags.length - 1]);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.navigateSuggestions(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.navigateSuggestions(-1);
    } else if (e.key === 'Escape') {
      this.hideTagSuggestions();
    }
  }

  private showTagSuggestions(query: string): void {
    if (!this.tagSuggestionsContainer) return;

    const lowerQuery = query.toLowerCase();
    const suggestions = this.availableTags
      .filter(tag =>
        tag.name.toLowerCase().includes(lowerQuery) &&
        !this.formData.tags.includes(tag.name)
      )
      .slice(0, 8);

    if (suggestions.length === 0) {
      this.hideTagSuggestions();
      return;
    }

    this.activeSuggestionIndex = -1;
    this.tagSuggestionsContainer.innerHTML = suggestions
      .map((tag, index) => `
        <div class="tag-suggestion" role="option" data-index="${index}" data-tag="${tag.name}" aria-selected="false">
          <span class="suggestion-name">${this.highlightMatch(tag.name, query)}</span>
          <span class="suggestion-count">${tag.count} video${tag.count !== 1 ? 's' : ''}</span>
        </div>
      `)
      .join('');

    this.tagSuggestionsContainer.style.display = 'block';
    this.tagInput!.setAttribute('aria-expanded', 'true');

    // Attach click listeners on suggestions
    const suggestionElements = this.tagSuggestionsContainer.querySelectorAll('.tag-suggestion');
    suggestionElements.forEach((el) => {
      el.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const tag = (el as HTMLElement).dataset.tag;
        if (tag) {
          this.addTag(tag);
        }
      });
    });
  }

  private hideTagSuggestions(): void {
    if (!this.tagSuggestionsContainer) return;
    this.tagSuggestionsContainer.style.display = 'none';
    this.tagSuggestionsContainer.innerHTML = '';
    this.activeSuggestionIndex = -1;
    this.tagInput?.setAttribute('aria-expanded', 'false');
  }

  private navigateSuggestions(direction: number): void {
    if (!this.tagSuggestionsContainer) return;
    const suggestions = this.tagSuggestionsContainer.querySelectorAll('.tag-suggestion');
    if (suggestions.length === 0) return;

    // Remove active state from current
    if (this.activeSuggestionIndex >= 0 && suggestions[this.activeSuggestionIndex]) {
      suggestions[this.activeSuggestionIndex].classList.remove('active');
      suggestions[this.activeSuggestionIndex].setAttribute('aria-selected', 'false');
    }

    // Calculate new index
    this.activeSuggestionIndex += direction;
    if (this.activeSuggestionIndex < 0) {
      this.activeSuggestionIndex = suggestions.length - 1;
    } else if (this.activeSuggestionIndex >= suggestions.length) {
      this.activeSuggestionIndex = 0;
    }

    // Apply active state
    suggestions[this.activeSuggestionIndex].classList.add('active');
    suggestions[this.activeSuggestionIndex].setAttribute('aria-selected', 'true');
  }

  private selectActiveSuggestion(): void {
    if (!this.tagSuggestionsContainer) return;
    const activeSuggestion = this.tagSuggestionsContainer.querySelector('.tag-suggestion.active') as HTMLElement;
    if (activeSuggestion) {
      const tag = activeSuggestion.dataset.tag;
      if (tag) {
        this.addTag(tag);
      }
    }
  }

  private addTag(tagName: string): void {
    const normalized = tagName.trim().toLowerCase();
    if (!normalized || this.formData.tags.includes(normalized)) {
      this.tagInput!.value = '';
      this.hideTagSuggestions();
      return;
    }

    this.formData.tags.push(normalized);
    this.tagInput!.value = '';
    this.hideTagSuggestions();
    this.renderTags();
    this.notifyChange();
    this.tagInput!.focus();
  }

  private removeTag(tagName: string): void {
    this.formData.tags = this.formData.tags.filter(t => t !== tagName);
    this.renderTags();
    this.notifyChange();
  }

  private renderTags(): void {
    const tagsDisplay = this.container.querySelector('#tags-display');
    if (!tagsDisplay) return;

    tagsDisplay.innerHTML = this.formData.tags
      .map(tag => `<span class="tag-chip" data-tag="${tag}">${tag}<button type="button" class="tag-remove" aria-label="Remove tag ${tag}">&times;</button></span>`)
      .join('');

    // Update placeholder
    if (this.tagInput) {
      this.tagInput.placeholder = this.formData.tags.length > 0 ? '' : 'Add tags...';
    }
  }

  private handleSubmit(): void {
    const result = this.validate();
    if (!result.isValid) {
      this.displayErrors(result.errors);
      // Focus first invalid field
      const firstErrorField = Object.keys(result.errors)[0];
      if (firstErrorField) {
        const field = this.container.querySelector(`[name="${firstErrorField}"]`) as HTMLElement;
        field?.focus();
      }
      return;
    }

    this.clearAllErrors();
    this.config.onSubmit(this.getFormData());
  }

  /**
   * Validate all form fields
   */
  public validate(): ValidationResult {
    const result = this.validator.validate({
      title: this.formData.title,
      description: this.formData.description,
    });
    this.validationErrors = result.errors;
    return result;
  }

  private validateField(fieldName: string, value: string): void {
    const result = this.validator.validateField(fieldName, value);
    if (!result.isValid) {
      this.validationErrors[fieldName] = result.errors[fieldName] || [];
      this.showFieldError(fieldName, result.firstError!);
    } else {
      delete this.validationErrors[fieldName];
      this.clearFieldError(fieldName);
    }
  }

  private showFieldError(fieldName: string, message: string): void {
    const errorEl = this.container.querySelector(`#${fieldName}-error`) as HTMLElement;
    if (errorEl) {
      errorEl.textContent = message;
    }

    const input = this.container.querySelector(`[name="${fieldName}"]`) as HTMLElement;
    if (input) {
      input.classList.add('input-error');
      input.setAttribute('aria-invalid', 'true');
      input.setAttribute('aria-describedby', `${fieldName}-error`);
    }
  }

  private clearFieldError(fieldName: string): void {
    const errorEl = this.container.querySelector(`#${fieldName}-error`) as HTMLElement;
    if (errorEl) {
      errorEl.textContent = '';
    }

    const input = this.container.querySelector(`[name="${fieldName}"]`) as HTMLElement;
    if (input) {
      input.classList.remove('input-error');
      input.setAttribute('aria-invalid', 'false');
    }
  }

  private displayErrors(errors: Record<string, string[]>): void {
    for (const [field, messages] of Object.entries(errors)) {
      if (messages.length > 0) {
        this.showFieldError(field, messages[0]);
      }
    }
  }

  private clearAllErrors(): void {
    this.validationErrors = {};
    const errorEls = this.container.querySelectorAll('.field-error');
    errorEls.forEach(el => { el.textContent = ''; });
    const inputs = this.container.querySelectorAll('.input-error');
    inputs.forEach(el => {
      el.classList.remove('input-error');
      el.setAttribute('aria-invalid', 'false');
    });
  }
