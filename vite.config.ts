import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  // Carga las variables de entorno para que Gemini pueda usar tu API Key
  const env = loadEnv(mode, process.cwd(), '');
  
  return {
    // IMPORTANTE: Esta es la ruta de tu proyecto en GitHub
    base: '/Dark-Stories-AI/', 
    
    plugins: [react(), tailwindcss()],
    
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});