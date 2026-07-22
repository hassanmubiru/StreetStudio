/**
 * Router Styles Loader
 * 
 * Dynamically loads router transition CSS styles.
 */

// Load router transition styles
async function loadRouterStyles() {
  const existingStyles = document.getElementById('router-transitions-styles');
  if (existingStyles) return;

  try {
    const response = await fetch('/src/styles/router-transitions.css');
    if (response.ok) {
      const css = await response.text();
      const styleElement = document.createElement('style');
      styleElement.id = 'router-transitions-styles';
      styleElement.textContent = css;
      document.head.appendChild(styleElement);
    }
  } catch (error) {
    console.warn('Failed to load router transition styles:', error);
  }
}

// Load styles immediately
loadRouterStyles();