/**
 * Skeleton Screens
 * 
 * Provides skeleton screen components for various loading states
 * throughout the application. Skeleton screens provide visual placeholders
 * that communicate content structure before actual data loads.
 * 
 * Requirements: 12.2, 12.5
 */

export interface SkeletonConfig {
  /** Width of skeleton element */
  width?: string;
  /** Height of skeleton element */
  height?: string;
  /** Border radius */
  borderRadius?: string;
  /** Whether to animate */
  animated?: boolean;
  /** Custom class name */
  className?: string;
  /** Accessible label */
  ariaLabel?: string;
}

/**
 * Create a basic skeleton element with pulse animation.
 */
export function createSkeleton(config: SkeletonConfig = {}): HTMLElement {
  const {
    width = '100%',
    height = '1em',
    borderRadius = '4px',
    animated = true,
    className = '',
    ariaLabel,
  } = config;

  const el = document.createElement('div');
  el.className = `skeleton-element ${animated ? 'skeleton-pulse' : ''} ${className}`.trim();
  el.style.width = width;
  el.style.height = height;
  el.style.borderRadius = borderRadius;
  el.setAttribute('aria-hidden', 'true');

  if (ariaLabel) {
    el.setAttribute('aria-label', ariaLabel);
    el.removeAttribute('aria-hidden');
    el.setAttribute('role', 'progressbar');
  }

  return el;
}

/**
 * Create a text skeleton (multiple lines).
 */
export function createTextSkeleton(lines: number = 3, config: Partial<SkeletonConfig> = {}): HTMLElement {
  const container = document.createElement('div');
  container.className = 'skeleton-text';
  container.setAttribute('aria-label', config.ariaLabel || 'Loading text content...');
  container.setAttribute('role', 'progressbar');

  for (let i = 0; i < lines; i++) {
    const line = createSkeleton({
      ...config,
      width: i === lines - 1 ? '60%' : '100%', // Last line is shorter
      height: '0.875em',
      className: 'skeleton-text-line',
    });
    line.style.marginBottom = '0.5em';
    container.appendChild(line);
  }

  return container;
}

/**
 * Create a card skeleton (thumbnail + text).
 */
export function createCardSkeleton(config: { showThumbnail?: boolean; lines?: number } = {}): HTMLElement {
  const { showThumbnail = true, lines = 2 } = config;

  const card = document.createElement('div');
  card.className = 'skeleton-card';
  card.setAttribute('aria-label', 'Loading content card...');
  card.setAttribute('role', 'progressbar');

  if (showThumbnail) {
    const thumbnail = createSkeleton({
      width: '100%',
      height: '180px',
      borderRadius: '8px 8px 0 0',
      className: 'skeleton-card-thumbnail',
    });
    card.appendChild(thumbnail);
  }

  const body = document.createElement('div');
  body.className = 'skeleton-card-body';
  body.style.padding = '12px';

  // Title
  const title = createSkeleton({ width: '70%', height: '1.2em', className: 'skeleton-card-title' });
  title.style.marginBottom = '8px';
  body.appendChild(title);

  // Description lines
  const text = createTextSkeleton(lines);
  text.removeAttribute('aria-label');
  text.removeAttribute('role');
  body.appendChild(text);

  card.appendChild(body);
  return card;
}

/**
 * Create a dashboard skeleton with multiple card placeholders.
 */
export function createDashboardSkeleton(cardCount: number = 6): HTMLElement {
  const dashboard = document.createElement('div');
  dashboard.className = 'skeleton-dashboard';
  dashboard.setAttribute('aria-label', 'Loading dashboard...');
  dashboard.setAttribute('role', 'progressbar');

  // Header skeleton
  const header = document.createElement('div');
  header.className = 'skeleton-dashboard-header';
  header.appendChild(createSkeleton({ width: '200px', height: '2em', className: 'skeleton-heading' }));
  header.appendChild(createSkeleton({ width: '120px', height: '2.5em', borderRadius: '6px', className: 'skeleton-button' }));
  dashboard.appendChild(header);

  // Grid of cards
  const grid = document.createElement('div');
  grid.className = 'skeleton-grid';

  for (let i = 0; i < cardCount; i++) {
    grid.appendChild(createCardSkeleton());
  }

  dashboard.appendChild(grid);
  return dashboard;
}

/**
 * Create a video player skeleton.
 */
export function createVideoPlayerSkeleton(): HTMLElement {
  const player = document.createElement('div');
  player.className = 'skeleton-video-player';
  player.setAttribute('aria-label', 'Loading video player...');
  player.setAttribute('role', 'progressbar');

  // Video area
  const videoArea = createSkeleton({
    width: '100%',
    height: '0',
    borderRadius: '8px',
    className: 'skeleton-video-area',
  });
  // 16:9 aspect ratio via padding-bottom
  videoArea.style.paddingBottom = '56.25%';
  videoArea.style.position = 'relative';
  player.appendChild(videoArea);

  // Play button placeholder
  const playButton = createSkeleton({
    width: '64px',
    height: '64px',
    borderRadius: '50%',
    className: 'skeleton-play-button',
  });
  playButton.style.position = 'absolute';
  playButton.style.top = '50%';
  playButton.style.left = '50%';
  playButton.style.transform = 'translate(-50%, -50%)';
  videoArea.appendChild(playButton);

  // Controls bar
  const controls = document.createElement('div');
  controls.className = 'skeleton-controls-bar';
  controls.appendChild(createSkeleton({ width: '100%', height: '4px', className: 'skeleton-progress' }));

  const controlsRow = document.createElement('div');
  controlsRow.className = 'skeleton-controls-row';
  controlsRow.appendChild(createSkeleton({ width: '32px', height: '32px', borderRadius: '50%' }));
  controlsRow.appendChild(createSkeleton({ width: '60px', height: '1em' }));
  controlsRow.appendChild(createSkeleton({ width: '80px', height: '32px', borderRadius: '4px' }));
  controls.appendChild(controlsRow);

  player.appendChild(controls);
  return player;
}

/**
 * Create a timeline editor skeleton.
 */
export function createTimelineEditorSkeleton(): HTMLElement {
  const editor = document.createElement('div');
  editor.className = 'skeleton-timeline-editor';
  editor.setAttribute('aria-label', 'Loading timeline editor...');
  editor.setAttribute('role', 'progressbar');

  // Preview area
  const preview = createSkeleton({
    width: '100%',
    height: '300px',
    borderRadius: '8px',
    className: 'skeleton-editor-preview',
  });
  editor.appendChild(preview);

  // Timeline tracks
  const timeline = document.createElement('div');
  timeline.className = 'skeleton-editor-timeline';

  for (let i = 0; i < 3; i++) {
    const track = createSkeleton({
      width: '100%',
      height: '48px',
      borderRadius: '4px',
      className: 'skeleton-track',
    });
    track.style.marginBottom = '4px';
    timeline.appendChild(track);
  }
  editor.appendChild(timeline);

  // Controls
  const controls = document.createElement('div');
  controls.className = 'skeleton-editor-controls';
  controls.appendChild(createSkeleton({ width: '40px', height: '40px', borderRadius: '50%' }));
  controls.appendChild(createSkeleton({ width: '40px', height: '40px', borderRadius: '50%' }));
  controls.appendChild(createSkeleton({ width: '40px', height: '40px', borderRadius: '50%' }));
  controls.appendChild(createSkeleton({ width: '100px', height: '1em' }));
  editor.appendChild(controls);

  return editor;
}

/**
 * Create a list skeleton with repeating rows.
 */
export function createListSkeleton(rowCount: number = 5): HTMLElement {
  const list = document.createElement('div');
  list.className = 'skeleton-list';
  list.setAttribute('aria-label', 'Loading list...');
  list.setAttribute('role', 'progressbar');

  for (let i = 0; i < rowCount; i++) {
    const row = document.createElement('div');
    row.className = 'skeleton-list-row';

    // Avatar
    row.appendChild(createSkeleton({ width: '40px', height: '40px', borderRadius: '50%' }));

    // Content
    const content = document.createElement('div');
    content.className = 'skeleton-list-content';
    content.appendChild(createSkeleton({ width: '40%', height: '1em' }));
    content.appendChild(createSkeleton({ width: '80%', height: '0.875em' }));
    row.appendChild(content);

    // Action
    row.appendChild(createSkeleton({ width: '60px', height: '32px', borderRadius: '4px' }));

    list.appendChild(row);
  }

  return list;
}

/**
 * Inject skeleton screen CSS styles into the document.
 */
export function injectSkeletonStyles(): void {
  if (document.getElementById('skeleton-styles')) return;

  const style = document.createElement('style');
  style.id = 'skeleton-styles';
  style.textContent = `
    .skeleton-element {
      background-color: var(--skeleton-bg, #e2e8f0);
      display: block;
    }

    .skeleton-pulse {
      animation: skeleton-pulse 1.5s ease-in-out infinite;
    }

    @keyframes skeleton-pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }

    @media (prefers-reduced-motion: reduce) {
      .skeleton-pulse {
        animation: none;
        opacity: 0.7;
      }
    }

    .skeleton-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 16px;
    }

    .skeleton-card {
      border-radius: 8px;
      overflow: hidden;
      border: 1px solid var(--skeleton-border, #e2e8f0);
    }

    .skeleton-dashboard-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
    }

    .skeleton-list-row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 0;
      border-bottom: 1px solid var(--skeleton-border, #e2e8f0);
    }

    .skeleton-list-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .skeleton-controls-bar {
      padding: 8px 0;
    }

    .skeleton-controls-row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding-top: 8px;
    }

    .skeleton-editor-timeline {
      padding: 16px 0;
    }

    .skeleton-editor-controls {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 0;
    }
  `;
  document.head.appendChild(style);
}
