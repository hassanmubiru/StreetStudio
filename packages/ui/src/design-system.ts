/**
 * StreetStudio Design System
 * 
 * Core design tokens, typography, colors, spacing, and visual language
 * for the StreetStudio application.
 */

export const colors = {
  // Brand colors
  brand: {
    primary: '#2563eb', // Blue 600
    secondary: '#7c3aed', // Violet 600
    accent: '#0891b2', // Cyan 600
  },
  
  // Semantic colors
  semantic: {
    success: '#059669', // Emerald 600
    warning: '#d97706', // Amber 600
    error: '#dc2626', // Red 600
    info: '#0284c7', // Sky 600
  },
  
  // Neutral grays
  gray: {
    50: '#f9fafb',
    100: '#f3f4f6',
    200: '#e5e7eb',
    300: '#d1d5db',
    400: '#9ca3af',
    500: '#6b7280',
    600: '#4b5563',
    700: '#374151',
    800: '#1f2937',
    900: '#111827',
    950: '#030712',
  },
  
  // High contrast colors for accessibility
  contrast: {
    white: '#ffffff',
    black: '#000000',
  },
} as const;

export const typography = {
  fonts: {
    sans: '"Inter", system-ui, -apple-system, sans-serif',
    mono: '"JetBrains Mono", "Fira Code", "Consolas", monospace',
  },
  
  sizes: {
    xs: '0.75rem',    // 12px
    sm: '0.875rem',   // 14px
    base: '1rem',     // 16px
    lg: '1.125rem',   // 18px
    xl: '1.25rem',    // 20px
    '2xl': '1.5rem',  // 24px
    '3xl': '1.875rem', // 30px
    '4xl': '2.25rem', // 36px
    '5xl': '3rem',    // 48px
  },
  
  weights: {
    normal: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
  },
  
  lineHeights: {
    tight: '1.25',
    normal: '1.5',
    relaxed: '1.75',
  },
} as const;

export const spacing = {
  0: '0',
  px: '1px',
  0.5: '0.125rem', // 2px
  1: '0.25rem',    // 4px
  1.5: '0.375rem', // 6px
  2: '0.5rem',     // 8px
  2.5: '0.625rem', // 10px
  3: '0.75rem',    // 12px
  3.5: '0.875rem', // 14px
  4: '1rem',       // 16px
  5: '1.25rem',    // 20px
  6: '1.5rem',     // 24px
  7: '1.75rem',    // 28px
  8: '2rem',       // 32px
  9: '2.25rem',    // 36px
  10: '2.5rem',    // 40px
  11: '2.75rem',   // 44px
  12: '3rem',      // 48px
  14: '3.5rem',    // 56px
  16: '4rem',      // 64px
  20: '5rem',      // 80px
  24: '6rem',      // 96px
  28: '7rem',      // 112px
  32: '8rem',      // 128px
  36: '9rem',      // 144px
  40: '10rem',     // 160px
  44: '11rem',     // 176px
  48: '12rem',     // 192px
  52: '13rem',     // 208px
  56: '14rem',     // 224px
  60: '15rem',     // 240px
  64: '16rem',     // 256px
  72: '18rem',     // 288px
  80: '20rem',     // 320px
  96: '24rem',     // 384px
} as const;

export const borderRadius = {
  none: '0',
  sm: '0.125rem',   // 2px
  base: '0.25rem',  // 4px
  md: '0.375rem',   // 6px
  lg: '0.5rem',     // 8px
  xl: '0.75rem',    // 12px
  '2xl': '1rem',    // 16px
  '3xl': '1.5rem',  // 24px
  full: '9999px',
} as const;

export const shadows = {
  sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
  base: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
  md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
  lg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
  xl: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
  '2xl': '0 25px 50px -12px rgb(0 0 0 / 0.25)',
  inner: 'inset 0 2px 4px 0 rgb(0 0 0 / 0.05)',
} as const;

export const breakpoints = {
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
} as const;

export const zIndex = {
  hide: -1,
  auto: 'auto',
  base: 0,
  docked: 10,
  dropdown: 1000,
  sticky: 1100,
  banner: 1200,
  overlay: 1300,
  modal: 1400,
  popover: 1500,
  skipLink: 1600,
  toast: 1700,
  tooltip: 1800,
} as const;

// Animation values
export const transitions = {
  none: 'none',
  all: 'all 150ms cubic-bezier(0.4, 0, 0.2, 1)',
  default: 'all 150ms cubic-bezier(0.4, 0, 0.2, 1)',
  colors: 'color 150ms cubic-bezier(0.4, 0, 0.2, 1), background-color 150ms cubic-bezier(0.4, 0, 0.2, 1), border-color 150ms cubic-bezier(0.4, 0, 0.2, 1)',
  opacity: 'opacity 150ms cubic-bezier(0.4, 0, 0.2, 1)',
  shadow: 'box-shadow 150ms cubic-bezier(0.4, 0, 0.2, 1)',
  transform: 'transform 150ms cubic-bezier(0.4, 0, 0.2, 1)',
} as const;

// Design token type helpers
export type Color = keyof typeof colors.gray | string;
export type Spacing = keyof typeof spacing;
export type FontSize = keyof typeof typography.sizes;
export type FontWeight = keyof typeof typography.weights;
export type BorderRadius = keyof typeof borderRadius;
export type Shadow = keyof typeof shadows;
export type Breakpoint = keyof typeof breakpoints;
export type ZIndex = keyof typeof zIndex;

// Utility functions for design system
export const getColor = (color: string): string => {
  const parts = color.split('.');
  if (parts.length === 2) {
    const [category, shade] = parts;
    return (colors as any)[category]?.[shade] || color;
  }
  return color;
};

export const getSpacing = (space: Spacing): string => spacing[space];

export const getFontSize = (size: FontSize): string => typography.sizes[size];

export const getBorderRadius = (radius: BorderRadius): string => borderRadius[radius];

export const getShadow = (shadow: Shadow): string => shadows[shadow];

// CSS custom properties generator
export const generateCSSVariables = (): Record<string, string> => {
  const vars: Record<string, string> = {};
  
  // Colors
  Object.entries(colors).forEach(([category, shades]) => {
    if (typeof shades === 'object') {
      Object.entries(shades).forEach(([shade, value]) => {
        vars[`--color-${category}-${shade}`] = value;
      });
    } else {
      vars[`--color-${category}`] = shades;
    }
  });
  
  // Spacing
  Object.entries(spacing).forEach(([key, value]) => {
    vars[`--spacing-${key}`] = value;
  });
  
  // Typography
  Object.entries(typography.sizes).forEach(([key, value]) => {
    vars[`--font-size-${key}`] = value;
  });
  
  Object.entries(typography.weights).forEach(([key, value]) => {
    vars[`--font-weight-${key}`] = value;
  });
  
  // Border radius
  Object.entries(borderRadius).forEach(([key, value]) => {
    vars[`--border-radius-${key}`] = value;
  });
  
  // Shadows
  Object.entries(shadows).forEach(([key, value]) => {
    vars[`--shadow-${key}`] = value;
  });
  
  return vars;
};