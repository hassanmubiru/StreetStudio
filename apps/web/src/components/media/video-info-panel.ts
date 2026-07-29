/**
 * Video Information Panel
 *
 * Displays video title, description, metadata, quality selection controls,
 * playback position memory with auto-resume, and caption/transcript toggles.
 *
 * Requirements: 5.4, 5.9, 5.10
 */

import { localStorage } from '../../services/storage.js';
import type { QualityLevel, PlaybackState } from './video-player.js';

// --- Interfaces ---

export interface VideoMetadata {
  id: string;
  title: string;
  description?: string;
  duration: number;
  createdAt?: string;
  creator?: string;
  fileSize?: number;
  resolution?: string;
  format?: string;
  tags?: string[];
}

export interface CaptionTrack {
  id: string;
  label: string;
  language: string;
  src: string;
  isDefault?: boolean;
}

export interface TranscriptEntry {
  startTime: number;
  endTime: number;
  text: string;
  speaker?: string;
}

export interface VideoInfoPanelOptions {
  enableQualitySelection?: boolean;
  enablePositionMemory?: boolean;
  enableCaptions?: boolean;
  enableTranscript?: boolean;
  autoAdaptQuality?: boolean;
  positionMemoryThreshold?: number; // minimum seconds to remember position
}

export interface VideoInfoPanelCallbacks {
  onQualityChange?: (quality: QualityLevel | 'auto') => void;
  onCaptionToggle?: (enabled: boolean, track?: CaptionTrack) => void;
  onTranscriptToggle?: (visible: boolean) => void;
  onTranscriptSeek?: (time: number) => void;
  onResumePosition?: (time: number) => void;
}

export interface PlaybackPosition {
  videoId: string;
  time: number;
  duration: number;
  timestamp: number;
}

// --- Constants ---

const STORAGE_KEY_POSITIONS = 'video_positions';
const STORAGE_KEY_QUALITY_PREF = 'video_quality_pref';
const STORAGE_KEY_CAPTIONS_ENABLED = 'video_captions_enabled';
const STORAGE_KEY_TRANSCRIPT_VISIBLE = 'video_transcript_visible';
const MAX_STORED_POSITIONS = 100;
const DEFAULT_POSITION_THRESHOLD = 10; // Minimum seconds before saving position
const POSITION_NEAR_END_THRESHOLD = 0.95; // 95% - don't resume near end

/**
 * VideoInfoPanel
 *
 * Renders a panel alongside the video player showing video information,
 * quality selection, and caption/transcript controls. Manages playback
 * position memory via localStorage for auto-resume.
 */
export class VideoInfoPanel {
  private container: HTMLElement;
  private options: Required<VideoInfoPanelOptions>;
  private callbacks: VideoInfoPanelCallbacks;
  private metadata: VideoMetadata | null = null;
  private availableQualities: QualityLevel[] = [];
  private currentQuality: QualityLevel | null = null;
  private selectedQualityMode: 'auto' | number = 'auto';
  private captionTracks: CaptionTrack[] = [];
  private activeCaptionTrack: CaptionTrack | null = null;
  private captionsEnabled = false;
  private transcriptEntries: TranscriptEntry[] = [];
  private transcriptVisible = false;
  private isDestroyed = false;

  private readonly defaultOptions: Required<VideoInfoPanelOptions> = {
    enableQualitySelection: true,
    enablePositionMemory: true,
    enableCaptions: true,
    enableTranscript: true,
    autoAdaptQuality: true,
    positionMemoryThreshold: DEFAULT_POSITION_THRESHOLD,
  };

  constructor(
    container: HTMLElement,
    options: VideoInfoPanelOptions = {},
    callbacks: VideoInfoPanelCallbacks = {}
  ) {
    this.container = container;
    this.options = { ...this.defaultOptions, ...options };
    this.callbacks = callbacks;

    // Load persisted preferences
    this.captionsEnabled = this.loadCaptionPreference();
    this.transcriptVisible = this.loadTranscriptPreference();
    this.selectedQualityMode = this.loadQualityPreference();

    this.render();
  }

  // --- Public API ---

  /**
   * Set video metadata and re-render the info section
   */
  public setMetadata(metadata: VideoMetadata): void {
    this.metadata = metadata;
    this.renderInfoSection();
  }

  /**
   * Update available quality levels from the player
   */
  public setAvailableQualities(qualities: QualityLevel[]): void {
    this.availableQualities = qualities;
    this.renderQualitySection();
  }

  /**
   * Update the currently active quality level
   */
  public setCurrentQuality(quality: QualityLevel): void {
    this.currentQuality = quality;
    this.updateQualityDisplay();
  }

  /**
   * Set caption tracks available for this video
   */
  public setCaptionTracks(tracks: CaptionTrack[]): void {
    this.captionTracks = tracks;
    // Auto-select default track
    if (!this.activeCaptionTrack) {
      this.activeCaptionTrack = tracks.find(t => t.isDefault) || tracks[0] || null;
    }
    this.renderCaptionSection();
  }

  /**
   * Set transcript entries for the video
   */
  public setTranscript(entries: TranscriptEntry[]): void {
    this.transcriptEntries = entries;
    this.renderTranscriptSection();
  }

  /**
   * Get the saved playback position for a video (for auto-resume)
   */
  public getSavedPosition(videoId: string): number | null {
    if (!this.options.enablePositionMemory) return null;

    const positions = this.loadPositions();
    const saved = positions.find(p => p.videoId === videoId);

    if (!saved) return null;

    // Don't resume if position is near the end
    if (saved.duration > 0 && saved.time / saved.duration >= POSITION_NEAR_END_THRESHOLD) {
      return null;
    }

    // Don't resume if below threshold
    if (saved.time < this.options.positionMemoryThreshold) {
      return null;
    }

    return saved.time;
  }

  /**
   * Save current playback position for later resume
   */
  public savePosition(videoId: string, time: number, duration: number): void {
    if (!this.options.enablePositionMemory) return;
    if (time < this.options.positionMemoryThreshold) return;

    // Don't save if near the end
    if (duration > 0 && time / duration >= POSITION_NEAR_END_THRESHOLD) {
      this.clearPosition(videoId);
      return;
    }

    const positions = this.loadPositions();
    const existingIndex = positions.findIndex(p => p.videoId === videoId);

    const entry: PlaybackPosition = {
      videoId,
      time,
      duration,
      timestamp: Date.now(),
    };

    if (existingIndex >= 0) {
      positions[existingIndex] = entry;
    } else {
      positions.push(entry);
    }

    // Limit stored positions
    if (positions.length > MAX_STORED_POSITIONS) {
      positions.sort((a, b) => b.timestamp - a.timestamp);
      positions.length = MAX_STORED_POSITIONS;
    }

    localStorage.setItem(STORAGE_KEY_POSITIONS, positions);
  }

  /**
   * Clear saved position for a video (e.g., when video completes)
   */
  public clearPosition(videoId: string): void {
    const positions = this.loadPositions();
    const filtered = positions.filter(p => p.videoId !== videoId);
    localStorage.setItem(STORAGE_KEY_POSITIONS, filtered);
  }

  /**
   * Check for saved position and trigger auto-resume callback
   */
  public checkAutoResume(videoId: string): boolean {
    const savedTime = this.getSavedPosition(videoId);
    if (savedTime !== null && savedTime > 0) {
      this.callbacks.onResumePosition?.(savedTime);
      return true;
    }
    return false;
  }

  /**
   * Update quality selection preference
   */
  public selectQuality(mode: 'auto' | number): void {
    this.selectedQualityMode = mode;
    this.saveQualityPreference(mode);
    this.updateQualityDisplay();

    if (mode === 'auto') {
      this.callbacks.onQualityChange?.('auto');
    } else {
      const quality = this.availableQualities.find(q => q.index === mode);
      if (quality) {
        this.callbacks.onQualityChange?.(quality);
      }
    }
  }

  /**
   * Toggle caption display
   */
  public toggleCaptions(enabled?: boolean): void {
    this.captionsEnabled = enabled !== undefined ? enabled : !this.captionsEnabled;
    this.saveCaptionPreference(this.captionsEnabled);
    this.updateCaptionToggleDisplay();
    this.callbacks.onCaptionToggle?.(this.captionsEnabled, this.activeCaptionTrack || undefined);
  }

  /**
   * Select a specific caption track
   */
  public selectCaptionTrack(trackId: string): void {
    const track = this.captionTracks.find(t => t.id === trackId);
    if (track) {
      this.activeCaptionTrack = track;
      this.updateCaptionTrackDisplay();
      if (this.captionsEnabled) {
        this.callbacks.onCaptionToggle?.(true, track);
      }
    }
  }

  /**
   * Toggle transcript panel visibility
   */
  public toggleTranscript(visible?: boolean): void {
    this.transcriptVisible = visible !== undefined ? visible : !this.transcriptVisible;
    this.saveTranscriptPreference(this.transcriptVisible);
    this.updateTranscriptDisplay();
    this.callbacks.onTranscriptToggle?.(this.transcriptVisible);
  }

  /**
   * Highlight the current transcript entry based on playback time
   */
  public highlightTranscriptAtTime(time: number): void {
    if (!this.transcriptVisible) return;

    const transcriptContainer = this.container.querySelector('.transcript-entries');
    if (!transcriptContainer) return;

    const entries = transcriptContainer.querySelectorAll('.transcript-entry');
    entries.forEach((entry, index) => {
      const transcriptEntry = this.transcriptEntries[index];
      if (transcriptEntry && time >= transcriptEntry.startTime && time < transcriptEntry.endTime) {
        entry.classList.add('transcript-entry--active');
        if (typeof entry.scrollIntoView === 'function') {
          entry.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      } else {
        entry.classList.remove('transcript-entry--active');
      }
    });
  }

  /**
   * Get current state of the info panel
   */
  public getState(): {
    captionsEnabled: boolean;
    transcriptVisible: boolean;
    selectedQualityMode: 'auto' | number;
    activeCaptionTrack: CaptionTrack | null;
  } {
    return {
      captionsEnabled: this.captionsEnabled,
      transcriptVisible: this.transcriptVisible,
      selectedQualityMode: this.selectedQualityMode,
      activeCaptionTrack: this.activeCaptionTrack,
    };
  }

  /**
   * Clean up and remove the panel
   */
  public destroy(): void {
    if (this.isDestroyed) return;
    this.isDestroyed = true;
    this.container.innerHTML = '';
  }

  // --- Rendering ---

  private render(): void {
    this.container.classList.add('video-info-panel');
    this.container.setAttribute('role', 'complementary');
    this.container.setAttribute('aria-label', 'Video information');
    this.container.innerHTML = '';

    this.renderInfoSection();
    this.renderQualitySection();
    this.renderCaptionSection();
    this.renderTranscriptSection();
  }

  private renderInfoSection(): void {
    let infoSection = this.container.querySelector('.info-section') as HTMLElement;
    if (!infoSection) {
      infoSection = document.createElement('section');
      infoSection.className = 'info-section';
      infoSection.setAttribute('aria-label', 'Video details');
      this.container.prepend(infoSection);
    }

    if (!this.metadata) {
      infoSection.innerHTML = '<p class="info-placeholder">No video information available</p>';
      return;
    }

    const meta = this.metadata;
    infoSection.innerHTML = `
      <div class="info-header">
        <h2 class="video-title" title="${this.escapeAttr(meta.title)}">${this.escapeHtml(meta.title)}</h2>
      </div>
      ${meta.description ? `<p class="video-description">${this.escapeHtml(meta.description)}</p>` : ''}
      <dl class="video-metadata">
        ${meta.duration > 0 ? `<div class="metadata-item"><dt>Duration</dt><dd>${this.formatDuration(meta.duration)}</dd></div>` : ''}
        ${meta.createdAt ? `<div class="metadata-item"><dt>Created</dt><dd>${this.formatDate(meta.createdAt)}</dd></div>` : ''}
        ${meta.creator ? `<div class="metadata-item"><dt>Creator</dt><dd>${this.escapeHtml(meta.creator)}</dd></div>` : ''}
        ${meta.fileSize ? `<div class="metadata-item"><dt>Size</dt><dd>${this.formatFileSize(meta.fileSize)}</dd></div>` : ''}
        ${meta.resolution ? `<div class="metadata-item"><dt>Resolution</dt><dd>${this.escapeHtml(meta.resolution)}</dd></div>` : ''}
        ${meta.format ? `<div class="metadata-item"><dt>Format</dt><dd>${this.escapeHtml(meta.format)}</dd></div>` : ''}
      </dl>
      ${meta.tags && meta.tags.length > 0 ? `
        <div class="video-tags" aria-label="Video tags">
          ${meta.tags.map(tag => `<span class="video-tag">${this.escapeHtml(tag)}</span>`).join('')}
        </div>
      ` : ''}
    `;
  }

  private renderQualitySection(): void {
    if (!this.options.enableQualitySelection) return;

    let qualitySection = this.container.querySelector('.quality-section') as HTMLElement;
    if (!qualitySection) {
      qualitySection = document.createElement('section');
      qualitySection.className = 'quality-section';
      qualitySection.setAttribute('aria-label', 'Quality settings');
      // Insert after info section
      const infoSection = this.container.querySelector('.info-section');
      if (infoSection) {
        infoSection.after(qualitySection);
      } else {
        this.container.appendChild(qualitySection);
      }
    }

    const qualities = this.availableQualities;
    const currentLabel = this.currentQuality?.label || 'Auto';

    qualitySection.innerHTML = `
      <div class="quality-header">
        <h3 class="section-title">Quality</h3>
        <span class="quality-current" aria-live="polite">${this.escapeHtml(currentLabel)}</span>
      </div>
      <div class="quality-controls">
        <select class="quality-select" aria-label="Video quality">
          <option value="auto" ${this.selectedQualityMode === 'auto' ? 'selected' : ''}>Auto${this.options.autoAdaptQuality ? ' (Adaptive)' : ''}</option>
          ${qualities.map(q => `
            <option value="${q.index}" ${this.selectedQualityMode === q.index ? 'selected' : ''}>
              ${q.label} (${this.formatBitrate(q.bitrate)})
            </option>
          `).join('')}
        </select>
      </div>
      ${this.options.autoAdaptQuality ? `
        <p class="quality-hint">Quality adapts automatically based on your connection speed.</p>
      ` : ''}
    `;

    // Bind quality selection event
    const selectEl = qualitySection.querySelector('.quality-select') as HTMLSelectElement;
    selectEl?.addEventListener('change', () => {
      const value = selectEl.value;
      if (value === 'auto') {
        this.selectQuality('auto');
      } else {
        this.selectQuality(parseInt(value, 10));
      }
    });
  }

  private renderCaptionSection(): void {
    if (!this.options.enableCaptions) return;

    let captionSection = this.container.querySelector('.caption-section') as HTMLElement;
    if (!captionSection) {
      captionSection = document.createElement('section');
      captionSection.className = 'caption-section';
      captionSection.setAttribute('aria-label', 'Caption settings');
      // Insert after quality section or info section
      const qualitySection = this.container.querySelector('.quality-section');
      const infoSection = this.container.querySelector('.info-section');
      const insertAfter = qualitySection || infoSection;
      if (insertAfter) {
        insertAfter.after(captionSection);
      } else {
        this.container.appendChild(captionSection);
      }
    }

    const hasTracks = this.captionTracks.length > 0;

    captionSection.innerHTML = `
      <div class="caption-header">
        <h3 class="section-title">Captions</h3>
      </div>
      <div class="caption-controls">
        <label class="caption-toggle-label">
          <input type="checkbox" class="caption-toggle"
            ${this.captionsEnabled ? 'checked' : ''}
            ${!hasTracks ? 'disabled' : ''}
            aria-label="Enable captions" />
          <span class="caption-toggle-text">${this.captionsEnabled ? 'On' : 'Off'}</span>
        </label>
        ${hasTracks && this.captionTracks.length > 1 ? `
          <select class="caption-track-select" aria-label="Caption language"
            ${!this.captionsEnabled ? 'disabled' : ''}>
            ${this.captionTracks.map(track => `
              <option value="${track.id}" ${this.activeCaptionTrack?.id === track.id ? 'selected' : ''}>
                ${this.escapeHtml(track.label)} (${track.language})
              </option>
            `).join('')}
          </select>
        ` : ''}
        ${!hasTracks ? '<p class="caption-unavailable">No captions available for this video.</p>' : ''}
      </div>
    `;

    // Bind caption toggle
    const toggleEl = captionSection.querySelector('.caption-toggle') as HTMLInputElement;
    toggleEl?.addEventListener('change', () => {
      this.toggleCaptions(toggleEl.checked);
    });

    // Bind track select
    const trackSelect = captionSection.querySelector('.caption-track-select') as HTMLSelectElement;
    trackSelect?.addEventListener('change', () => {
      this.selectCaptionTrack(trackSelect.value);
    });
  }

  private renderTranscriptSection(): void {
    if (!this.options.enableTranscript) return;

    let transcriptSection = this.container.querySelector('.transcript-section') as HTMLElement;
    if (!transcriptSection) {
      transcriptSection = document.createElement('section');
      transcriptSection.className = 'transcript-section';
      transcriptSection.setAttribute('aria-label', 'Transcript');
      this.container.appendChild(transcriptSection);
    }

    const hasTranscript = this.transcriptEntries.length > 0;

    transcriptSection.innerHTML = `
      <div class="transcript-header">
        <h3 class="section-title">Transcript</h3>
        <button type="button" class="transcript-toggle-btn"
          ${!hasTranscript ? 'disabled' : ''}
          aria-expanded="${this.transcriptVisible}"
          aria-controls="transcript-content">
          ${this.transcriptVisible ? 'Hide' : 'Show'}
        </button>
      </div>
      ${!hasTranscript ? '<p class="transcript-unavailable">No transcript available for this video.</p>' : ''}
      ${hasTranscript && this.transcriptVisible ? `
        <div id="transcript-content" class="transcript-entries" role="list" aria-label="Transcript entries">
          ${this.transcriptEntries.map((entry, index) => `
            <div class="transcript-entry" role="listitem" data-index="${index}"
              data-start="${entry.startTime}" data-end="${entry.endTime}"
              tabindex="0" aria-label="Jump to ${this.formatTimestamp(entry.startTime)}">
              <span class="transcript-time">${this.formatTimestamp(entry.startTime)}</span>
              ${entry.speaker ? `<span class="transcript-speaker">${this.escapeHtml(entry.speaker)}:</span>` : ''}
              <span class="transcript-text">${this.escapeHtml(entry.text)}</span>
            </div>
          `).join('')}
        </div>
      ` : ''}
    `;

    // Bind transcript toggle
    const toggleBtn = transcriptSection.querySelector('.transcript-toggle-btn');
    toggleBtn?.addEventListener('click', () => {
      this.toggleTranscript();
    });

    // Bind transcript entry click-to-seek
    if (hasTranscript && this.transcriptVisible) {
      const entriesContainer = transcriptSection.querySelector('.transcript-entries');
      entriesContainer?.addEventListener('click', (e) => {
        const entry = (e.target as HTMLElement).closest('.transcript-entry') as HTMLElement;
        if (entry) {
          const startTime = parseFloat(entry.dataset.start || '0');
          this.callbacks.onTranscriptSeek?.(startTime);
        }
      });

      entriesContainer?.addEventListener('keydown', (e) => {
        if ((e as KeyboardEvent).key === 'Enter' || (e as KeyboardEvent).key === ' ') {
          const entry = (e.target as HTMLElement).closest('.transcript-entry') as HTMLElement;
          if (entry) {
            e.preventDefault();
            const startTime = parseFloat(entry.dataset.start || '0');
            this.callbacks.onTranscriptSeek?.(startTime);
          }
        }
      });
    }
  }

  // --- UI Update Helpers ---

  private updateQualityDisplay(): void {
    const currentEl = this.container.querySelector('.quality-current');
    if (currentEl) {
      const label = this.selectedQualityMode === 'auto'
        ? `Auto${this.currentQuality ? ` (${this.currentQuality.label})` : ''}`
        : this.currentQuality?.label || 'Unknown';
      currentEl.textContent = label;
    }
  }

  private updateCaptionToggleDisplay(): void {
    const toggleEl = this.container.querySelector('.caption-toggle') as HTMLInputElement;
    const textEl = this.container.querySelector('.caption-toggle-text');
    const trackSelect = this.container.querySelector('.caption-track-select') as HTMLSelectElement;

    if (toggleEl) toggleEl.checked = this.captionsEnabled;
    if (textEl) textEl.textContent = this.captionsEnabled ? 'On' : 'Off';
    if (trackSelect) trackSelect.disabled = !this.captionsEnabled;
  }

  private updateCaptionTrackDisplay(): void {
    const trackSelect = this.container.querySelector('.caption-track-select') as HTMLSelectElement;
    if (trackSelect && this.activeCaptionTrack) {
      trackSelect.value = this.activeCaptionTrack.id;
    }
  }

  private updateTranscriptDisplay(): void {
    // Re-render transcript section to show/hide content
    this.renderTranscriptSection();
  }

  // --- Storage Helpers ---

  private loadPositions(): PlaybackPosition[] {
    return localStorage.getItem<PlaybackPosition[]>(STORAGE_KEY_POSITIONS, []) || [];
  }

  private loadQualityPreference(): 'auto' | number {
    const pref = localStorage.getItem<string>(STORAGE_KEY_QUALITY_PREF, 'auto');
    if (pref === 'auto' || pref === undefined) return 'auto';
    const parsed = parseInt(pref, 10);
    return isNaN(parsed) ? 'auto' : parsed;
  }

  private saveQualityPreference(mode: 'auto' | number): void {
    localStorage.setItem(STORAGE_KEY_QUALITY_PREF, String(mode));
  }

  private loadCaptionPreference(): boolean {
    return localStorage.getItem<boolean>(STORAGE_KEY_CAPTIONS_ENABLED, false) || false;
  }

  private saveCaptionPreference(enabled: boolean): void {
    localStorage.setItem(STORAGE_KEY_CAPTIONS_ENABLED, enabled);
  }

  private loadTranscriptPreference(): boolean {
    return localStorage.getItem<boolean>(STORAGE_KEY_TRANSCRIPT_VISIBLE, false) || false;
  }

  private saveTranscriptPreference(visible: boolean): void {
    localStorage.setItem(STORAGE_KEY_TRANSCRIPT_VISIBLE, visible);
  }

  // --- Formatting Helpers ---

  private formatDuration(seconds: number): string {
    if (!isFinite(seconds) || seconds < 0) return '0:00';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hrs > 0) {
      return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${mins}:${String(secs).padStart(2, '0')}`;
  }

  private formatTimestamp(seconds: number): string {
    return this.formatDuration(seconds);
  }

  private formatDate(isoDate: string): string {
    try {
      const date = new Date(isoDate);
      return date.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return isoDate;
    }
  }

  private formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  private formatBitrate(bitrate: number): string {
    if (bitrate < 1000) return `${bitrate} bps`;
    if (bitrate < 1000000) return `${(bitrate / 1000).toFixed(0)} kbps`;
    return `${(bitrate / 1000000).toFixed(1)} Mbps`;
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private escapeAttr(text: string): string {
    return text.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
}
