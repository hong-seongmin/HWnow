import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Enhanced frontend initialization logging
console.log('[Main] === FRONTEND INITIALIZATION START ===');
console.log('[Main] Document ready state:', document.readyState);
console.log('[Main] Window location:', window.location.href);
console.log('[Main] User agent:', navigator.userAgent);

// Check for Wails environment
console.log('[Main] Wails environment check:', {
  hasWailsGo: typeof window.go !== 'undefined',
  hasWailsRuntime: typeof window.runtime !== 'undefined',
  hasWindow: typeof window !== 'undefined',
  hasDocument: typeof document !== 'undefined'
});

// Enhanced error handling for WebView2 environment
const initializeApp = () => {
  console.log('[Main] Starting app initialization...');

  const rootElement = document.getElementById('root');
  if (!rootElement) {
    console.error('[Main] === CRITICAL ERROR: Root element not found! ===');
    console.error('[Main] DOM body children:', document.body?.children?.length || 0);
    console.error('[Main] DOM elements with ID:', Array.from(document.querySelectorAll('[id]')).map(el => el.id));

    // Create fallback root element
    const fallbackRoot = document.createElement('div');
    fallbackRoot.id = 'root';
    fallbackRoot.style.width = '100%';
    fallbackRoot.style.height = '100vh';
    document.body.appendChild(fallbackRoot);

    console.log('[Main] Created fallback root element');
    initializeReactApp(fallbackRoot);
  } else {
    console.log('[Main] Root element found successfully');
    initializeReactApp(rootElement);
  }
};

const initializeReactApp = (rootElement: HTMLElement) => {
  try {
    console.log('[Main] Creating React root...');
    const root = ReactDOM.createRoot(rootElement);

    console.log('[Main] Rendering React app...');
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );

    console.log('[Main] === FRONTEND INITIALIZATION SUCCESS ===');
  } catch (error) {
    console.error('[Main] === REACT INITIALIZATION FAILED ===');
    console.error('[Main] Error details:', error);

    // Fallback rendering without StrictMode
    try {
      console.log('[Main] Attempting fallback render without StrictMode...');
      const root = ReactDOM.createRoot(rootElement);
      root.render(<App />);
      console.log('[Main] Fallback render successful');
    } catch (fallbackError) {
      console.error('[Main] Fallback render also failed:', fallbackError);
      rootElement.innerHTML = `
        <div style="color: red; padding: 20px; font-family: Arial, sans-serif;">
          <h2>Application Initialization Failed</h2>
          <p>Frontend rendering error in WebView2 environment.</p>
          <pre style="background: #f0f0f0; padding: 10px; margin: 10px 0;">${error}</pre>
        </div>
      `;
    }
  }
};

// Wait for DOM and Wails to be ready
if (document.readyState === 'loading') {
  console.log('[Main] Waiting for DOM content to load...');
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  console.log('[Main] DOM already ready, initializing immediately');
  // Add small delay for WebView2 stability
  setTimeout(initializeApp, 100);
}
