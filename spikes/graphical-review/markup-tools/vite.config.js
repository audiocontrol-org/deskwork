import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Excalidraw expects React mounted via JSX; vitejs-plugin-react handles
// the transform without a separate tsconfig.
export default defineConfig({
  plugins: [react()],
  // Excalidraw checks process.env.NODE_ENV at runtime; surface a value.
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
    'process.env.IS_PREACT': JSON.stringify(false)
  }
});
