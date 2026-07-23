/**
 * View Layout Controller
 * Manages different view layouts (list, grid, timeline) for video library
 * Implements Requirement 4.3: Multiple view layouts with user preferences
 */

export type ViewLayout = 'list' | 'grid' | 'timeline';

export interface ViewLayoutPreferences {
  defaultLayout: ViewLayout;
  gridColumns: number;
  showThumbnails: boolean;
  compactMode: boolean;
}

export class ViewLayoutController {
  private preferences: ViewLayoutPreferences;

  constructor() {
    this.preferences = this.loadUserPreferences();
  }

  public getPreferences(): ViewLayoutPreferences {
    return { ...this.preferences };
  }

  public updatePreference<K extends keyof ViewLayoutPreferences>(
    key: K, 
    value: ViewLayoutPreferences[K]
  ): void {
    this.preferences[key] = value;
    this.saveUserPreferences();
  }

  public getLayoutClassName(layout: ViewLayout): string {
    switch (layout) {
      case 'list':
        return 'video-library-list';
      case 'grid':
        return `video-library-grid grid-cols-${this.preferences.gridColumns}`;
      case 'timeline':
        return 'video-library-timeline';
      default:
        return 'video-library-grid';
    }
  }

  public getOptimalColumnCount(containerWidth: number): number {
    // Calculate optimal columns based on container width
    const minCardWidth = 240; // Minimum width for video cards
    const gap = 16; // Grid gap in pixels
    
    return Math.max(1, Math.floor((containerWidth + gap) / (minCardWidth + gap)));
  }

  public supportsLayout(layout: ViewLayout): boolean {
    // All layouts are supported for now
    return ['list', 'grid', 'timeline'].includes(layout);
  }

  private loadUserPreferences(): ViewLayoutPreferences {
    try {
      const stored = localStorage.getItem('videoLibrary.layoutPreferences');
      if (stored) {
        return { ...this.getDefaultPreferences(), ...JSON.parse(stored) };
      }
    } catch (error) {
      console.warn('Failed to load layout preferences:', error);
    }
    
    return this.getDefaultPreferences();
  }

  private saveUserPreferences(): void {
    try {
      localStorage.setItem('videoLibrary.layoutPreferences', JSON.stringify(this.preferences));
    } catch (error) {
      console.warn('Failed to save layout preferences:', error);
    }
  }

  private getDefaultPreferences(): ViewLayoutPreferences {
    return {
      defaultLayout: 'grid',
      gridColumns: 4,
      showThumbnails: true,
      compactMode: false
    };
  }
}