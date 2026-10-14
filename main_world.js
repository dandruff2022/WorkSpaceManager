// Main world interceptors for clipboard and SPA history navigation
(() => {
  // Intercept Clipboard writeText
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    const originalWriteText = navigator.clipboard.writeText.bind(navigator.clipboard);
    navigator.clipboard.writeText = async (text) => {
      document.dispatchEvent(new CustomEvent('agyCopyCaptured', { detail: text }));
      if (window.__agy_intercept_active === true) {
        return Promise.resolve();
      }
      return originalWriteText(text);
    };
  }

  // Intercept SPA History navigation
  const originalPushState = history.pushState.bind(history);
  const originalReplaceState = history.replaceState.bind(history);

  history.pushState = function(...args) {
    const result = originalPushState(...args);
    document.dispatchEvent(new CustomEvent('agyNavigation', { detail: args[2] || location.pathname }));
    return result;
  };

  history.replaceState = function(...args) {
    const result = originalReplaceState(...args);
    document.dispatchEvent(new CustomEvent('agyNavigation', { detail: args[2] || location.pathname }));
    return result;
  };
})();
