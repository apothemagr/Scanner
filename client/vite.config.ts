import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import fs from 'fs'
import path from 'path'

function loadCert() {
  try {
    return {
      key: fs.readFileSync(path.resolve(__dirname, 'cert-key.pem')),
      cert: fs.readFileSync(path.resolve(__dirname, 'cert.pem')),
    }
  } catch {
    return null
  }
}

const customCert = loadCert()

export default defineConfig({
  plugins: customCert ? [react()] : [react(), basicSsl()],
  server: {
    host: true,
    port: 5173,
    ...(customCert ? { https: customCert } : {}),
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        autoRewrite: true,
      },
    },
  },
})
