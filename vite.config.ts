import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  server: {
    // Proxy API requests to backend to avoid CORS issues
    proxy: {
      '/train_data': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/predictfootsteps': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/status': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/reset_model': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/dataset': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/train_mlp': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/predict_mlp': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/dataset_status': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/train': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/model': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 1000, // Increase limit to 1MB
    rollupOptions: {
      output: {
        manualChunks: {
          // Split vendor chunks
          'vendor-react': ['react', 'react-dom'],
          'vendor-charts': ['chart.js', 'react-chartjs-2'],
          'vendor-icons': ['lucide-react'],
          'vendor-firebase': ['firebase/app', 'firebase/auth'],
        },
      },
    },
  },
});
