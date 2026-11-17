import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { App } from './App'
import { ProvedorConta } from './conta'
import { iniciarTema } from './tema'
import './estilo.css'

iniciarTema()

createRoot(document.getElementById('raiz')!).render(
  <StrictMode>
    <BrowserRouter>
      <ProvedorConta>
        <App />
      </ProvedorConta>
    </BrowserRouter>
  </StrictMode>,
)
