import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, ErroApi, type Conta } from './api'

interface ContextoConta {
  conta: Conta | null
  carregando: boolean
  sessaoEncerrada: boolean
  recarregar: () => Promise<void>
  sair: () => Promise<void>
}

const Contexto = createContext<ContextoConta | null>(null)

export function ProvedorConta({ children }: { children: ReactNode }) {
  const [conta, setConta] = useState<Conta | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [sessaoEncerrada, setSessaoEncerrada] = useState(false)

  const recarregar = useCallback(async () => {
    try {
      setConta(await api.conta())
      setSessaoEncerrada(false)
    } catch (e) {
      if (e instanceof ErroApi && e.status === 401) setConta(null)
    } finally {
      setCarregando(false)
    }
  }, [])

  const sair = useCallback(async () => {
    try {
      await api.sair()
    } finally {
      setConta(null)
    }
  }, [])

  useEffect(() => {
    void recarregar()
  }, [recarregar])

  useEffect(() => {
    const aoEncerrar = () => {
      setConta((atual) => {
        if (atual) setSessaoEncerrada(true)
        return null
      })
    }
    window.addEventListener('sessao-encerrada', aoEncerrar)
    return () => window.removeEventListener('sessao-encerrada', aoEncerrar)
  }, [])

  return (
    <Contexto.Provider value={{ conta, carregando, sessaoEncerrada, recarregar, sair }}>
      {children}
    </Contexto.Provider>
  )
}

export function useConta(): ContextoConta {
  const contexto = useContext(Contexto)
  if (!contexto) throw new Error('useConta precisa estar dentro de ProvedorConta.')
  return contexto
}

export function useContaAtiva(): Conta {
  const { conta } = useConta()
  if (!conta) throw new Error('Esta tela exige um usuário autenticado.')
  return conta
}
