import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
  },
  build: {
    rollupOptions: {
      input: {
        app: 'index.html',
        'widget-embed': 'src/widget-embed.ts',
      },
      output: {
        entryFileNames: (chunk) => {
          if (chunk.name === 'widget-embed') {
            return 'wassapp-appointment-widget.js';
          }
          return 'assets/[name]-[hash].js';
        },
      },
    },
  },
});
