/**
 * Global CSS Styles Setup
 * 
 * Initializes the StreetStudio design system and global styles.
 */

import { generateCSSVariables, colors, spacing, typography, borderRadius, shadows } from '@streetstudio/ui';

export function setupGlobalCSS(): void {
  // Create and inject CSS variables
  const cssVariables = generateCSSVariables();
  const cssVarsString = Object.entries(cssVariables)
    .map(([key, value]) => `${key}: ${value}`)
    .join('; ');
  
  document.documentElement.style.cssText = cssVarsString;

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
      font-family: ${typography.fonts.sans};
      color: ${colors.gray[900]};
      background-color: ${colors.contrast.white};
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
      outline: 2px solid ${colors.brand.primary};
      outline-offset: 2px;
    }
    
    :focus:not(:focus-visible) {
      outline: none;
    }
    
    :focus-visible {
      outline: 2px solid ${colors.brand.primary};
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
    
    .not-sr-only {
      position: static;
      width: auto;
      height: auto;
      padding: 0;
      margin: 0;
      overflow: visible;
      clip: auto;
      white-space: normal;
    }
    
    /* Focus management for keyboard navigation */
    .focus\\:not-sr-only:focus {
      position: static;
      width: auto;
      height: auto;
      padding: 0;
      margin: 0;
      overflow: visible;
      clip: auto;
      white-space: normal;
    }
    
    /* Dark mode support */
    @media (prefers-color-scheme: dark) {
      body {
        color: ${colors.gray[100]};
        background-color: ${colors.gray[900]};
      }
    }
    
    /* High contrast mode */
    @media (prefers-contrast: high) {
      :focus-visible {
        outline-width: 3px;
      }
    }
    
    /* Reduced motion */
    @media (prefers-reduced-motion: reduce) {
      *,
      *::before,
      *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
        scroll-behavior: auto !important;
      }
    }
    
    /* Utility classes */
    .container {
      width: 100%;
      margin-left: auto;
      margin-right: auto;
      padding-left: ${spacing[4]};
      padding-right: ${spacing[4]};
    }
    
    @media (min-width: 640px) {
      .container {
        max-width: 640px;
      }
    }
    
    @media (min-width: 768px) {
      .container {
        max-width: 768px;
      }
    }
    
    @media (min-width: 1024px) {
      .container {
        max-width: 1024px;
      }
    }
    
    @media (min-width: 1280px) {
      .container {
        max-width: 1280px;
      }
    }
    
    @media (min-width: 1536px) {
      .container {
        max-width: 1536px;
      }
    }
    
    /* Layout utilities */
    .flex {
      display: flex;
    }
    
    .inline-flex {
      display: inline-flex;
    }
    
    .grid {
      display: grid;
    }
    
    .hidden {
      display: none;
    }
    
    .block {
      display: block;
    }
    
    .inline-block {
      display: inline-block;
    }
    
    /* Flexbox utilities */
    .items-center {
      align-items: center;
    }
    
    .items-start {
      align-items: flex-start;
    }
    
    .items-end {
      align-items: flex-end;
    }
    
    .justify-center {
      justify-content: center;
    }
    
    .justify-between {
      justify-content: space-between;
    }
    
    .justify-start {
      justify-content: flex-start;
    }
    
    .justify-end {
      justify-content: flex-end;
    }
    
    .flex-col {
      flex-direction: column;
    }
    
    .flex-wrap {
      flex-wrap: wrap;
    }
    
    .flex-1 {
      flex: 1 1 0%;
    }
    
    .flex-shrink-0 {
      flex-shrink: 0;
    }
    
    /* Grid utilities */
    .grid-cols-1 {
      grid-template-columns: repeat(1, minmax(0, 1fr));
    }
    
    .grid-cols-2 {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    
    .grid-cols-3 {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
    
    .grid-cols-4 {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
    
    .gap-1 {
      gap: ${spacing[1]};
    }
    
    .gap-2 {
      gap: ${spacing[2]};
    }
    
    .gap-3 {
      gap: ${spacing[3]};
    }
    
    .gap-4 {
      gap: ${spacing[4]};
    }
    
    .gap-6 {
      gap: ${spacing[6]};
    }
    
    .gap-8 {
      gap: ${spacing[8]};
    }
    
    /* Spacing utilities */
    .p-0 { padding: 0; }
    .p-1 { padding: ${spacing[1]}; }
    .p-2 { padding: ${spacing[2]}; }
    .p-3 { padding: ${spacing[3]}; }
    .p-4 { padding: ${spacing[4]}; }
    .p-6 { padding: ${spacing[6]}; }
    .p-8 { padding: ${spacing[8]}; }
    
    .px-1 { padding-left: ${spacing[1]}; padding-right: ${spacing[1]}; }
    .px-2 { padding-left: ${spacing[2]}; padding-right: ${spacing[2]}; }
    .px-3 { padding-left: ${spacing[3]}; padding-right: ${spacing[3]}; }
    .px-4 { padding-left: ${spacing[4]}; padding-right: ${spacing[4]}; }
    .px-6 { padding-left: ${spacing[6]}; padding-right: ${spacing[6]}; }
    .px-8 { padding-left: ${spacing[8]}; padding-right: ${spacing[8]}; }
    
    .py-1 { padding-top: ${spacing[1]}; padding-bottom: ${spacing[1]}; }
    .py-2 { padding-top: ${spacing[2]}; padding-bottom: ${spacing[2]}; }
    .py-3 { padding-top: ${spacing[3]}; padding-bottom: ${spacing[3]}; }
    .py-4 { padding-top: ${spacing[4]}; padding-bottom: ${spacing[4]}; }
    .py-6 { padding-top: ${spacing[6]}; padding-bottom: ${spacing[6]}; }
    .py-8 { padding-top: ${spacing[8]}; padding-bottom: ${spacing[8]}; }
    
    .m-0 { margin: 0; }
    .m-1 { margin: ${spacing[1]}; }
    .m-2 { margin: ${spacing[2]}; }
    .m-3 { margin: ${spacing[3]}; }
    .m-4 { margin: ${spacing[4]}; }
    .m-6 { margin: ${spacing[6]}; }
    .m-8 { margin: ${spacing[8]}; }
    
    .mx-auto { margin-left: auto; margin-right: auto; }
    
    .mb-1 { margin-bottom: ${spacing[1]}; }
    .mb-2 { margin-bottom: ${spacing[2]}; }
    .mb-3 { margin-bottom: ${spacing[3]}; }
    .mb-4 { margin-bottom: ${spacing[4]}; }
    .mb-6 { margin-bottom: ${spacing[6]}; }
    .mb-8 { margin-bottom: ${spacing[8]}; }
    
    .mt-1 { margin-top: ${spacing[1]}; }
    .mt-2 { margin-top: ${spacing[2]}; }
    .mt-3 { margin-top: ${spacing[3]}; }
    .mt-4 { margin-top: ${spacing[4]}; }
    .mt-6 { margin-top: ${spacing[6]}; }
    .mt-8 { margin-top: ${spacing[8]}; }
    
    /* Width and height utilities */
    .w-full { width: 100%; }
    .w-auto { width: auto; }
    .w-screen { width: 100vw; }
    
    .h-full { height: 100%; }
    .h-auto { height: auto; }
    .h-screen { height: 100vh; }
    .min-h-screen { min-height: 100vh; }
    
    /* Position utilities */
    .relative { position: relative; }
    .absolute { position: absolute; }
    .fixed { position: fixed; }
    .sticky { position: sticky; }
    
    .inset-0 { top: 0; right: 0; bottom: 0; left: 0; }
    .top-0 { top: 0; }
    .right-0 { right: 0; }
    .bottom-0 { bottom: 0; }
    .left-0 { left: 0; }
    
    /* Z-index utilities */
    .z-0 { z-index: 0; }
    .z-10 { z-index: 10; }
    .z-20 { z-index: 20; }
    .z-30 { z-index: 30; }
    .z-40 { z-index: 40; }
    .z-50 { z-index: 50; }
    
    /* Typography utilities */
    .text-xs { font-size: ${typography.sizes.xs}; }
    .text-sm { font-size: ${typography.sizes.sm}; }
    .text-base { font-size: ${typography.sizes.base}; }
    .text-lg { font-size: ${typography.sizes.lg}; }
    .text-xl { font-size: ${typography.sizes.xl}; }
    .text-2xl { font-size: ${typography.sizes['2xl']}; }
    .text-3xl { font-size: ${typography.sizes['3xl']}; }
    
    .font-normal { font-weight: ${typography.weights.normal}; }
    .font-medium { font-weight: ${typography.weights.medium}; }
    .font-semibold { font-weight: ${typography.weights.semibold}; }
    .font-bold { font-weight: ${typography.weights.bold}; }
    
    .text-center { text-align: center; }
    .text-left { text-align: left; }
    .text-right { text-align: right; }
    
    /* Color utilities */
    .text-white { color: ${colors.contrast.white}; }
    .text-black { color: ${colors.contrast.black}; }
    .text-gray-50 { color: ${colors.gray[50]}; }
    .text-gray-100 { color: ${colors.gray[100]}; }
    .text-gray-200 { color: ${colors.gray[200]}; }
    .text-gray-300 { color: ${colors.gray[300]}; }
    .text-gray-400 { color: ${colors.gray[400]}; }
    .text-gray-500 { color: ${colors.gray[500]}; }
    .text-gray-600 { color: ${colors.gray[600]}; }
    .text-gray-700 { color: ${colors.gray[700]}; }
    .text-gray-800 { color: ${colors.gray[800]}; }
    .text-gray-900 { color: ${colors.gray[900]}; }
    
    .bg-white { background-color: ${colors.contrast.white}; }
    .bg-gray-50 { background-color: ${colors.gray[50]}; }
    .bg-gray-100 { background-color: ${colors.gray[100]}; }
    .bg-gray-800 { background-color: ${colors.gray[800]}; }
    .bg-gray-900 { background-color: ${colors.gray[900]}; }
    
    /* Border utilities */
    .border { border-width: 1px; }
    .border-0 { border-width: 0; }
    .border-t { border-top-width: 1px; }
    .border-r { border-right-width: 1px; }
    .border-b { border-bottom-width: 1px; }
    .border-l { border-left-width: 1px; }
    
    .border-gray-200 { border-color: ${colors.gray[200]}; }
    .border-gray-300 { border-color: ${colors.gray[300]}; }
    
    .rounded { border-radius: ${borderRadius.base}; }
    .rounded-sm { border-radius: ${borderRadius.sm}; }
    .rounded-md { border-radius: ${borderRadius.md}; }
    .rounded-lg { border-radius: ${borderRadius.lg}; }
    .rounded-xl { border-radius: ${borderRadius.xl}; }
    .rounded-full { border-radius: ${borderRadius.full}; }
    
    /* Shadow utilities */
    .shadow { box-shadow: ${shadows.base}; }
    .shadow-sm { box-shadow: ${shadows.sm}; }
    .shadow-md { box-shadow: ${shadows.md}; }
    .shadow-lg { box-shadow: ${shadows.lg}; }
    .shadow-xl { box-shadow: ${shadows.xl}; }
    
    /* Transition utilities */
    .transition { transition-property: color, background-color, border-color, text-decoration-color, fill, stroke, opacity, box-shadow, transform, filter, backdrop-filter; transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1); transition-duration: 150ms; }
    .transition-colors { transition-property: color, background-color, border-color, text-decoration-color, fill, stroke; transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1); transition-duration: 150ms; }
    .transition-opacity { transition-property: opacity; transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1); transition-duration: 150ms; }
    .transition-transform { transition-property: transform; transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1); transition-duration: 150ms; }
    
    /* Hover and focus states */
    .hover\\:bg-gray-50:hover { background-color: ${colors.gray[50]}; }
    .hover\\:bg-gray-100:hover { background-color: ${colors.gray[100]}; }
    .hover\\:text-gray-700:hover { color: ${colors.gray[700]}; }
    .hover\\:text-gray-900:hover { color: ${colors.gray[900]}; }
    
    .focus\\:outline-none:focus { outline: 2px solid transparent; outline-offset: 2px; }
    .focus\\:ring-2:focus { --ring-offset-shadow: var(--ring-inset) 0 0 0 var(--ring-offset-width) var(--ring-offset-color); --ring-shadow: var(--ring-inset) 0 0 0 calc(2px + var(--ring-offset-width)) var(--ring-color); box-shadow: var(--ring-offset-shadow), var(--ring-shadow), var(--shadow, 0 0 #0000); }
    .focus\\:ring-offset-2:focus { --ring-offset-width: 2px; }
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