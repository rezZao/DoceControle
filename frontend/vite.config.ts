import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Em desenvolvimento, o Vite serve o site e repassa /api para a API em C#.
// O build vai para o wwwroot da API, que passa a servir tudo junto.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:5187' },
  },
  build: {
    outDir: '../backend/DoceControle.Api/wwwroot',
    emptyOutDir: true,
  },
})
