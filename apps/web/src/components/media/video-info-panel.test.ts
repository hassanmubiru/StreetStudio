/**
 * Unit tests for VideoInfoPanel
 *
 * Tests video information display, quality selection, playback position memory,
 * and caption/transcript toggle controls.
 *
 * Requirements: 5.4, 5.9, 5.10
 */

// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  VideoInfoPanel,
} from './video-info-panel';
import type {
  VideoMetadata,
  CaptionTrack,
  TranscriptEntry,
  VideoInfoPanelOptions,
  VideoInfoPanelCallbacks,
} from './video-info-panel';
import type { QualityLevel } from './video-player';

// Mock the storage service
vi.mock('../../services/storage.js', () => {
  const store = new Map<string, any>();
  return {
    localStorage: {
      setItem: vi.fn((key: string, value: any) => {
        store.set(key, value);
        return true;
      }),
      getItem: vi.fn((key: string, defaultValue?: any) => {
        return store.has(key) ? store.get(key) : defaultValue;
      }),
      removeItem: vi.fn((key: string) => {
        store.delete(key);
        return true;
      }),
      clear: vi.fn(() => {
        store.clear();
        return true;
      }),
      __store: store,
    },
  };
});

function createContainer(): HTMLElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  return container;
}

function createMockMetadata(overrides: Partial<VideoMetadata> = {}): VideoMetadata {
  return {
    id: 'video-123',
    title: 'Test Video',
    description: 'A test video description',
    duration: 300,
    createdAt: '2024-01-15T10:30:00Z',
    creator: 'John Doe',
    fileSize: 52428800, // 50 MB
    resolution: '1920x1080',
    format: 'mp4',
    tags: ['tutorial', 'demo'],
    ...overrides,
  };
}

function createMockQualities(): QualityLevel[] {
  return [
    { index: 0, label: '360p', bitrate: 500000, width: 640, height: 360, active: false },
    { index: 1, label: '720p', bitrate: 2000000, width: 1280, height: 720, active: false },
    { index: 2, label: '1080p', bitrate: 5000000, width: 1920, height: 1080, active: true },
  ];
}

function createMockCaptionTracks(): CaptionTrack[] {
  return [
    { id: 'en', label: 'English', language: 'en', src: '/captions/en.vtt', isDefault: true },
    { id: 'es', label: 'Spanish', language: 'es', src: '/captions/es.vtt' },
  ];
}

function createMockTranscript(): TranscriptEntry[] {
  return [
    { startTime: 0, endTime: 5, text: 'Hello and welcome.', speaker: 'Host' },
    { startTime: 5, endTime: 12, text: 'Today we will explore the topic.', speaker: 'Host' },
    { startTime: 12, endTime: 20, text: 'Let me show you a demo.' },
  ];
}

describe('VideoInfoPanel', () => {
  let container: HTMLElement;
  let panel: VideoInfoPanel;
  let callbacks: VideoInfoPanelCallbacks;
  let mockStorage: Map<string, any>;

  beforeEach(async () => {
    container = createContainer();
    callbacks = {
      onQualityChange: vi.fn(),
      onCaptionToggle: vi.fn(),
      onTranscriptToggle: vi.fn(),
      onTranscriptSeek: vi.fn(),
      onResumePosition: vi.fn(),
    };
    // Get access to mock storage
    const storageMod = await import('../../services/storage.js');
    mockStorage = (storageMod.localStorage as any).__store;
    mockStorage.clear();
  });

  afterEach(() => {
    if (panel) {
      panel.destroy();
    }
    container.remove();
  });

  describe('initialization', () => {
    it('creates panel with proper ARIA attributes', () => {
      panel = new VideoInfoPanel(container, {}, callbacks);
      expect(container.getAttribute('role')).toBe('complementary');
      expect(container.getAttribute('aria-label')).toBe('Video information');
    });

    it('creates panel with video-info-panel class', () => {
      panel = new VideoInfoPanel(container, {}, callbacks);
      expect(container.classList.contains('video-info-panel')).toBe(true);
    });

    it('shows placeholder when no metadata is set', () => {
      panel = new VideoInfoPanel(container, {}, callbacks);
      const placeholder = container.querySelector('.info-placeholder');
      expect(placeholder).not.toBeNull();
      expect(placeholder?.textContent).toContain('No video information available');
    });
  });

  describe('video information display', () => {
    it('displays video title', () => {
      panel = new VideoInfoPanel(container, {}, callbacks);
      panel.setMetadata(createMockMetadata());
      const title = container.querySelector('.video-title');
      expect(title?.textContent).toBe('Test Video');
    });

    it('displays video description', () => {
      panel = new VideoInfoPanel(container, {}, callbacks);
      panel.setMetadata(createMockMetadata());
      const description = container.querySelector('.video-description');
      expect(description?.textContent).toBe('A test video description');
    });

    it('hides description when not provided', () => {
      panel = new VideoInfoPanel(container, {}, callbacks);
      panel.setMetadata(createMockMetadata({ description: undefined }));
      const description = container.querySelector('.video-description');
      expect(description).toBeNull();
    });

    it('displays metadata fields', () => {
      panel = new VideoInfoPanel(container, {}, callbacks);
      panel.setMetadata(createMockMetadata());
      const metadataEl = container.querySelector('.video-metadata');
      expect(metadataEl).not.toBeNull();
      expect(metadataEl?.textContent).toContain('Duration');
      expect(metadataEl?.textContent).toContain('5:00');
      expect(metadataEl?.textContent).toContain('Creator');
      expect(metadataEl?.textContent).toContain('John Doe');
      expect(metadataEl?.textContent).toContain('Size');
      expect(metadataEl?.textContent).toContain('50.0 MB');
    });

    it('displays video tags', () => {
      panel = new VideoInfoPanel(container, {}, callbacks);
      panel.setMetadata(createMockMetadata());
      const tags = container.querySelectorAll('.video-tag');
      expect(tags.length).toBe(2);
      expect(tags[0]!.textContent).toBe('tutorial');
      expect(tags[1]!.textContent).toBe('demo');
    });

    it('escapes HTML in title and description', () => {
      panel = new VideoInfoPanel(container, {}, callbacks);
      panel.setMetadata(createMockMetadata({
        title: '<script>alert("xss")</script>',
        description: '<img onerror="alert(1)" />',
      }));
      const title = container.querySelector('.video-title');
      expect(title?.innerHTML).not.toContain('<script>');
      expect(title?.textContent).toContain('<script>');
    });
  });

  describe('quality selection', () => {
    it('renders quality section with select element', () => {
      panel = new VideoInfoPanel(container, { enableQualitySelection: true }, callbacks);
      panel.setAvailableQualities(createMockQualities());
      const select = container.querySelector('.quality-select') as HTMLSelectElement;
      expect(select).not.toBeNull();
      // Auto + 3 quality levels = 4 options
      expect(select?.options.length).toBe(4);
    });

    it('has auto option selected by default', () => {
      panel = new VideoInfoPanel(container, { enableQualitySelection: true }, callbacks);
      panel.setAvailableQualities(createMockQualities());
      const select = container.querySelector('.quality-select') as HTMLSelectElement;
      expect(select?.value).toBe('auto');
    });

    it('fires onQualityChange callback when quality is selected', () => {
      panel = new VideoInfoPanel(container, { enableQualitySelection: true }, callbacks);
      panel.setAvailableQualities(createMockQualities());
      panel.selectQuality(1);
      expect(callbacks.onQualityChange).toHaveBeenCalledWith(
        expect.objectContaining({ index: 1, label: '720p' })
      );
    });

    it('fires onQualityChange with auto when auto is selected', () => {
      panel = new VideoInfoPanel(container, { enableQualitySelection: true }, callbacks);
      panel.setAvailableQualities(createMockQualities());
      panel.selectQuality('auto');
      expect(callbacks.onQualityChange).toHaveBeenCalledWith('auto');
    });

    it('displays current quality indicator', () => {
      panel = new VideoInfoPanel(container, { enableQualitySelection: true }, callbacks);
      panel.setAvailableQualities(createMockQualities());
      panel.setCurrentQuality(createMockQualities()[2]!);
      const current = container.querySelector('.quality-current');
      expect(current?.textContent).toContain('1080p');
    });

    it('hides quality section when disabled', () => {
      panel = new VideoInfoPanel(container, { enableQualitySelection: false }, callbacks);
      const qualitySection = container.querySelector('.quality-section');
      expect(qualitySection).toBeNull();
    });

    it('shows adaptive quality hint when autoAdaptQuality is enabled', () => {
      panel = new VideoInfoPanel(container, { enableQualitySelection: true, autoAdaptQuality: true }, callbacks);
      panel.setAvailableQualities(createMockQualities());
      const hint = container.querySelector('.quality-hint');
      expect(hint?.textContent).toContain('adapts automatically');
    });
  });

  describe('playback position memory', () => {
    it('saves playback position to storage', () => {
      panel = new VideoInfoPanel(container, { enablePositionMemory: true }, callbacks);
      panel.savePosition('video-1', 60, 300);
      const savedTime = panel.getSavedPosition('video-1');
      expect(savedTime).toBe(60);
    });

    it('returns null for unsaved videos', () => {
      panel = new VideoInfoPanel(container, { enablePositionMemory: true }, callbacks);
      const savedTime = panel.getSavedPosition('nonexistent-video');
      expect(savedTime).toBeNull();
    });

    it('does not save position below threshold', () => {
      panel = new VideoInfoPanel(container, { enablePositionMemory: true, positionMemoryThreshold: 10 }, callbacks);
      panel.savePosition('video-1', 5, 300);
      const savedTime = panel.getSavedPosition('video-1');
      expect(savedTime).toBeNull();
    });

    it('clears position when video is near the end', () => {
      panel = new VideoInfoPanel(container, { enablePositionMemory: true }, callbacks);
      // First save a valid position
      panel.savePosition('video-1', 60, 300);
      expect(panel.getSavedPosition('video-1')).toBe(60);
      // Now save near end - should clear
      panel.savePosition('video-1', 290, 300);
      expect(panel.getSavedPosition('video-1')).toBeNull();
    });

    it('does not resume position near the end', () => {
      panel = new VideoInfoPanel(container, { enablePositionMemory: true }, callbacks);
      // Manually set a position that's near the end via storage
      mockStorage.set('video_positions', [{ videoId: 'video-1', time: 295, duration: 300, timestamp: Date.now() }]);
      const savedTime = panel.getSavedPosition('video-1');
      expect(savedTime).toBeNull();
    });

    it('checkAutoResume triggers callback with saved position', () => {
      panel = new VideoInfoPanel(container, { enablePositionMemory: true }, callbacks);
      panel.savePosition('video-1', 120, 300);
      const resumed = panel.checkAutoResume('video-1');
      expect(resumed).toBe(true);
      expect(callbacks.onResumePosition).toHaveBeenCalledWith(120);
    });

    it('checkAutoResume returns false when no saved position', () => {
      panel = new VideoInfoPanel(container, { enablePositionMemory: true }, callbacks);
      const resumed = panel.checkAutoResume('no-such-video');
      expect(resumed).toBe(false);
      expect(callbacks.onResumePosition).not.toHaveBeenCalled();
    });

    it('clearPosition removes saved position', () => {
      panel = new VideoInfoPanel(container, { enablePositionMemory: true }, callbacks);
      panel.savePosition('video-1', 60, 300);
      panel.clearPosition('video-1');
      expect(panel.getSavedPosition('video-1')).toBeNull();
    });

    it('does nothing when position memory is disabled', () => {
      panel = new VideoInfoPanel(container, { enablePositionMemory: false }, callbacks);
      panel.savePosition('video-1', 60, 300);
      expect(panel.getSavedPosition('video-1')).toBeNull();
    });
  });

  describe('caption controls', () => {
    it('renders caption section with toggle', () => {
      panel = new VideoInfoPanel(container, { enableCaptions: true }, callbacks);
      panel.setCaptionTracks(createMockCaptionTracks());
      const toggle = container.querySelector('.caption-toggle') as HTMLInputElement;
      expect(toggle).not.toBeNull();
    });

    it('toggleCaptions fires callback', () => {
      panel = new VideoInfoPanel(container, { enableCaptions: true }, callbacks);
      panel.setCaptionTracks(createMockCaptionTracks());
      panel.toggleCaptions(true);
      expect(callbacks.onCaptionToggle).toHaveBeenCalledWith(true, expect.objectContaining({ id: 'en' }));
    });

    it('toggleCaptions toggles state when no argument is given', () => {
      panel = new VideoInfoPanel(container, { enableCaptions: true }, callbacks);
      panel.setCaptionTracks(createMockCaptionTracks());
      // Initial state is off
      expect(panel.getState().captionsEnabled).toBe(false);
      panel.toggleCaptions();
      expect(panel.getState().captionsEnabled).toBe(true);
      panel.toggleCaptions();
      expect(panel.getState().captionsEnabled).toBe(false);
    });

    it('shows track selector when multiple tracks are available', () => {
      panel = new VideoInfoPanel(container, { enableCaptions: true }, callbacks);
      panel.setCaptionTracks(createMockCaptionTracks());
      const trackSelect = container.querySelector('.caption-track-select');
      expect(trackSelect).not.toBeNull();
    });

    it('shows unavailable message when no tracks', () => {
      panel = new VideoInfoPanel(container, { enableCaptions: true }, callbacks);
      panel.setCaptionTracks([]);
      const unavailable = container.querySelector('.caption-unavailable');
      expect(unavailable?.textContent).toContain('No captions available');
    });

    it('selectCaptionTrack updates active track', () => {
      panel = new VideoInfoPanel(container, { enableCaptions: true }, callbacks);
      panel.setCaptionTracks(createMockCaptionTracks());
      panel.selectCaptionTrack('es');
      expect(panel.getState().activeCaptionTrack?.id).toBe('es');
    });

    it('hides caption section when disabled', () => {
      panel = new VideoInfoPanel(container, { enableCaptions: false }, callbacks);
      const captionSection = container.querySelector('.caption-section');
      expect(captionSection).toBeNull();
    });

    it('disables toggle when no tracks are available', () => {
      panel = new VideoInfoPanel(container, { enableCaptions: true }, callbacks);
      panel.setCaptionTracks([]);
      const toggle = container.querySelector('.caption-toggle') as HTMLInputElement;
      expect(toggle?.disabled).toBe(true);
    });
  });

  describe('transcript controls', () => {
    it('renders transcript section with toggle button', () => {
      panel = new VideoInfoPanel(container, { enableTranscript: true }, callbacks);
      panel.setTranscript(createMockTranscript());
      const toggleBtn = container.querySelector('.transcript-toggle-btn');
      expect(toggleBtn).not.toBeNull();
    });

    it('toggleTranscript shows/hides transcript entries', () => {
      panel = new VideoInfoPanel(container, { enableTranscript: true }, callbacks);
      panel.setTranscript(createMockTranscript());
      // Initially hidden
      let entries = container.querySelector('.transcript-entries');
      expect(entries).toBeNull();

      panel.toggleTranscript(true);
      entries = container.querySelector('.transcript-entries');
      expect(entries).not.toBeNull();

      panel.toggleTranscript(false);
      entries = container.querySelector('.transcript-entries');
      expect(entries).toBeNull();
    });

    it('toggleTranscript fires callback', () => {
      panel = new VideoInfoPanel(container, { enableTranscript: true }, callbacks);
      panel.setTranscript(createMockTranscript());
      panel.toggleTranscript(true);
      expect(callbacks.onTranscriptToggle).toHaveBeenCalledWith(true);
    });

    it('displays transcript entries with timestamps', () => {
      panel = new VideoInfoPanel(container, { enableTranscript: true }, callbacks);
      panel.setTranscript(createMockTranscript());
      panel.toggleTranscript(true);
      const entries = container.querySelectorAll('.transcript-entry');
      expect(entries.length).toBe(3);
      expect(entries[0]!.querySelector('.transcript-time')?.textContent).toBe('0:00');
      expect(entries[0]!.querySelector('.transcript-text')?.textContent).toBe('Hello and welcome.');
    });

    it('displays speaker names when available', () => {
      panel = new VideoInfoPanel(container, { enableTranscript: true }, callbacks);
      panel.setTranscript(createMockTranscript());
      panel.toggleTranscript(true);
      const speakers = container.querySelectorAll('.transcript-speaker');
      expect(speakers.length).toBe(2); // First two entries have speakers
      expect(speakers[0]!.textContent).toContain('Host');
    });

    it('clicking transcript entry triggers seek callback', () => {
      panel = new VideoInfoPanel(container, { enableTranscript: true }, callbacks);
      panel.setTranscript(createMockTranscript());
      panel.toggleTranscript(true);
      const entry = container.querySelector('.transcript-entry') as HTMLElement;
      entry.click();
      expect(callbacks.onTranscriptSeek).toHaveBeenCalledWith(0);
    });

    it('shows unavailable message when no transcript', () => {
      panel = new VideoInfoPanel(container, { enableTranscript: true }, callbacks);
      panel.setTranscript([]);
      const unavailable = container.querySelector('.transcript-unavailable');
      expect(unavailable?.textContent).toContain('No transcript available');
    });

    it('disables toggle button when no transcript', () => {
      panel = new VideoInfoPanel(container, { enableTranscript: true }, callbacks);
      panel.setTranscript([]);
      const toggleBtn = container.querySelector('.transcript-toggle-btn') as HTMLButtonElement;
      expect(toggleBtn?.disabled).toBe(true);
    });

    it('highlightTranscriptAtTime highlights the correct entry', () => {
      panel = new VideoInfoPanel(container, { enableTranscript: true }, callbacks);
      panel.setTranscript(createMockTranscript());
      panel.toggleTranscript(true);
      panel.highlightTranscriptAtTime(7);
      const entries = container.querySelectorAll('.transcript-entry');
      expect(entries[0]!.classList.contains('transcript-entry--active')).toBe(false);
      expect(entries[1]!.classList.contains('transcript-entry--active')).toBe(true);
      expect(entries[2]!.classList.contains('transcript-entry--active')).toBe(false);
    });

    it('hides transcript section when disabled', () => {
      panel = new VideoInfoPanel(container, { enableTranscript: false }, callbacks);
      const transcriptSection = container.querySelector('.transcript-section');
      expect(transcriptSection).toBeNull();
    });
  });

  describe('getState', () => {
    it('returns current panel state', () => {
      panel = new VideoInfoPanel(container, {}, callbacks);
      panel.setCaptionTracks(createMockCaptionTracks());
      const state = panel.getState();
      expect(state.captionsEnabled).toBe(false);
      expect(state.transcriptVisible).toBe(false);
      expect(state.selectedQualityMode).toBe('auto');
      expect(state.activeCaptionTrack?.id).toBe('en');
    });
  });

  describe('destroy', () => {
    it('clears the container', () => {
      panel = new VideoInfoPanel(container, {}, callbacks);
      panel.setMetadata(createMockMetadata());
      panel.destroy();
      expect(container.innerHTML).toBe('');
    });

    it('does not double-destroy', () => {
      panel = new VideoInfoPanel(container, {}, callbacks);
      panel.destroy();
      expect(() => panel.destroy()).not.toThrow();
    });
  });
});
