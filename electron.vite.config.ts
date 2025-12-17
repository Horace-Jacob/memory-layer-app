import { resolve } from 'path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
          // Add native host as separate entry
          'native-host': resolve(__dirname, 'src/native-host/index.ts'),
          'build-native-host': resolve(__dirname, 'src/scripts/build-native-host.ts'),
          'content-fetch-worker': resolve(
            __dirname,
            'src/main/data-processor/content-fetch-worker.ts'
          ),
          'vector-search-worker': resolve(
            __dirname,
            'src/main/data-processor/vector-search-worker.ts'
          )
        },
        output: {
          // Ensure native-host goes to a predictable location
          entryFileNames: (chunkInfo) => {
            if (chunkInfo.name === 'native-host') {
              return 'native-host.js';
            }
            return '[name].js';
          }
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react(), tailwindcss()]
  }
});
