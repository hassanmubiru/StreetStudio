/**
 * Global CSS Styles Setup
 * 
 * Initializes the StreetStudio design system and global styles.
 */

import { ValidationCSS } from '../utils/validation.js';

export async function setupGlobalCSS(): Promise<void> {
  // Load project-specific styles
  await loadProjectStyles();
  
  // Inject global styles
  const globalStyles = `
    /* Reset and base styles */
    *,
    *::before,
    *::after {
      box-sizing: border-box;
    }
    
    * {
      margin: 0;
    }
    
    html,
    body {
      height: 100%;
    }
    
    body {
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
      font-family: system-ui, -apple-system, sans-serif;
      color: #111827;
      background-color: #ffffff;
    }
    
    img,
    picture,
    video,
    canvas,
    svg {
      display: block;
      max-width: 100%;
    }
    
    input,
    button,
    textarea,
    select {
      font: inherit;
    }
    
    p,
    h1,
    h2,
    h3,
    h4,
    h5,
    h6 {
      overflow-wrap: break-word;
    }
    
    #app {
      isolation: isolate;
    }
    
    /* Focus management */
    :focus {
      outline: 2px solid #2563eb;
      outline-offset: 2px;
    }
    
    :focus:not(:focus-visible) {
      outline: none;
    }
    
    :focus-visible {
      outline: 2px solid #2563eb;
      outline-offset: 2px;
    }
    
    /* Screen reader only utility */
    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }
    
    /* Form validation styles */
    ${ValidationCSS}
  `;

  // Create or update style element
  let styleElement = document.getElementById('streetstudio-global-styles') as HTMLStyleElement;
  
  if (!styleElement) {
    styleElement = document.createElement('style');
    styleElement.id = 'streetstudio-global-styles';
    document.head.appendChild(styleElement);
  }
  
  styleElement.textContent = globalStyles;
}

async function loadProjectStyles(): Promise<void> {
  try {
    const response = await fetch('/src/styles/projects.css');
    if (response.ok) {
      const projectCSS = await response.text();
      
      let projectStyleElement = document.getElementById('streetstudio-project-styles') as HTMLStyleElement;
      if (!projectStyleElement) {
        projectStyleElement = document.createElement('style');
        projectStyleElement.id = 'streetstudio-project-styles';
        document.head.appendChild(projectStyleElement);
      }
      
      projectStyleElement.textContent = projectCSS;
    }
  } catch (error) {
    console.warn('Could not load project styles:', error);
  }
}