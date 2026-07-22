/**
 * Toast Notification System Mock
 * 
 * Simple mock implementation for toast notifications until the full UI library is ready
 */

export interface ToastOptions {
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export const toast = {
  success: (message: string, options?: ToastOptions) => {
    console.log(`✅ ${message}`, options);
  },
  
  error: (message: string, options?: ToastOptions) => {
    console.error(`❌ ${message}`, options);
  },
  
  warning: (message: string, options?: ToastOptions) => {
    console.warn(`⚠️ ${message}`, options);
  },
  
  info: (message: string, options?: ToastOptions) => {
    console.info(`ℹ️ ${message}`, options);
  },
};