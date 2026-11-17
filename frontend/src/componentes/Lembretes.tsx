import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { api, mensagemDeErro, type Jejum, type Lembrete } from '../api'
import { dataHoraLocal, dataIso, duracao, fmt } from '../util'
import { Icone } from './Base'

// lembretes de insulina e tempo máximo sem comer: tocam com a página aberta e, se o navegador permitir, por notificação

const JANELA_MIN = 180 // depois de 3 horas o lembrete deixa de tocar e fica como "não confirmado"
const ADIAR_MIN = 10

export type EstadoLembrete = 'confirmado' | 'tocando' | 'adiado' | 'atrasado' | 'aguardando' | 'inativo'

interface ContextoLembretes {
  lembretes: Lembrete[]
  jejum: Jejum | null
  estadoDe: (lembrete: Lembrete) => EstadoLembrete
  confirmar: (id: number) => Promise<void>
  recarregar: () => Promise<void>
  somLiberado: boolean
  testarSom: () => void
  notificacoes: NotificationPermission | 'indisponivel'
  pedirNotificacoes: () => Promise<void>
}

const Contexto = createContext<ContextoLembretes | null>(null)

const minutosDe = (horario: string) => {
  const [h, m] = horario.split(':').map(Number)
  return h * 60 + m
}

const chaveAdiado = (id: number, dia: string) => `dococontrole.adiado.${id}.${dia}`

function adiadoAte(id: number, dia: string): number {
  try {
    return Number(localStorage.getItem(chaveAdiado(id, dia)) ?? 0)
  } catch {
    return 0
  }
}

export function descreverLembrete(l: Lembrete): string {
  const partes = [l.descricao ?? 'Insulina']
  if (l.doseInformada !== null) partes.push(`dose informada: ${fmt(l.doseInformada)} unidades`)
  return partes.join(' · ')
}

export function ProvedorLembretes({ children }: { children: ReactNode }) {
  const [lembretes, setLembretes] = useState<Lembrete[]>([])
  const [jejum, setJejum] = useState<Jejum | null>(null)
  const [agora, setAgora] = useState(() => new Date())
  const [somLiberado, setSomLiberado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [notificacoes, setNotificacoes] = useState<NotificationPermission | 'indisponivel'>(() =>
    'Notification' in window ? Notification.permission : 'indisponivel',
  )
  const audio = useRef<AudioContext | null>(null)
  const ultimoToque = useRef(new Map<number, number>())
  const alertouJejum = useRef(false)

  const recarregar = useCallback(async () => {
    try {
      setLembretes(await api.lembretes(dataIso()))
    } catch {
      // Sem conexão: mantém os lembretes já carregados, que continuam tocando.
    }
    try {
      setJejum(await api.jejum(dataHoraLocal()))
    } catch {
      // Sem conexão: mantém o último estado conhecido.
    }
  }, [])

  // Recarrega a cada minuto (o que também mantém a sessão ativa enquanto a página está aberta).
  useEffect(() => {
    void recarregar()
    const relogio = window.setInterval(() => setAgora(new Date()), 10_000)
    const busca = window.setInterval(() => void recarregar(), 60_000)
    const aoVoltar = () => {
      setAgora(new Date())
      void recarregar()
    }
    window.addEventListener('focus', aoVoltar)
    return () => {
      window.clearInterval(relogio)
      window.clearInterval(busca)
      window.removeEventListener('focus', aoVoltar)
    }
  }, [recarregar])

  // Navegadores só deixam tocar som depois de uma interação do usuário com a página.
  useEffect(() => {
    const liberar = () => {
      try {
        audio.current ??= new AudioContext()
        void audio.current.resume().then(() => setSomLiberado(true))
      } catch {
        setSomLiberado(false)
      }
    }
    window.addEventListener('pointerdown', liberar)
    window.addEventListener('keydown', liberar)
    return () => {
      window.removeEventListener('pointerdown', liberar)
      window.removeEventListener('keydown', liberar)
    }
  }, [])

  const tocarSom = useCallback(() => {
    const ctx = audio.current
    if (!ctx || ctx.state !== 'running') return
    for (let i = 0; i < 3; i++) {
      const inicio = ctx.currentTime + i * 0.35
      const oscilador = ctx.createOscillator()
      const volume = ctx.createGain()
      oscilador.frequency.value = 880
      volume.gain.setValueAtTime(0.0001, inicio)
      volume.gain.exponentialRampToValueAtTime(0.35, inicio + 0.02)
      volume.gain.exponentialRampToValueAtTime(0.0001, inicio + 0.25)
      oscilador.connect(volume).connect(ctx.destination)
      oscilador.start(inicio)
      oscilador.stop(inicio + 0.3)
    }
  }, [])

  const estadoDe = useCallback(
    (l: Lembrete): EstadoLembrete => {
      if (!l.ativo) return 'inativo'
      if (l.confirmadoHoje) return 'confirmado'
      const minutoAtual = agora.getHours() * 60 + agora.getMinutes()
      const passados = minutoAtual - minutosDe(l.horario)
      if (passados < 0) return 'aguardando'
      if (passados > JANELA_MIN) return 'atrasado'
      return adiadoAte(l.id, dataIso(agora)) > agora.getTime() ? 'adiado' : 'tocando'
    },
    [agora],
  )

  const tocando = lembretes.filter((l) => estadoDe(l) === 'tocando')

  useEffect(() => {
    const momento = agora.getTime()
    for (const l of tocando) {
      const ultimo = ultimoToque.current.get(l.id) ?? 0
      if (momento - ultimo < l.repeticaoMin * 60_000 - 5_000) continue
      ultimoToque.current.set(l.id, momento)
      tocarSom()
      if (notificacoes === 'granted') {
        try {
          new Notification('Hora da insulina', {
            body: `${l.horario} · ${descreverLembrete(l)}`,
            tag: `lembrete-${l.id}`,
          })
        } catch {
          // Alguns navegadores móveis não aceitam notificação criada pela página.
        }
      }
    }
  }, [agora, tocando, tocarSom, notificacoes])

  // Se o som só foi liberado depois que o lembrete começou, toca assim que possível.
  const haTocando = tocando.length > 0
  useEffect(() => {
    if (somLiberado && haTocando) tocarSom()
  }, [somLiberado, haTocando, tocarSom])

  // passou do tempo sem comer: avisa uma vez (som, notificação e faixa no topo); registrar uma refeição zera a contagem
  const jejumExcedido = jejum?.estado === 'Excedido'
  useEffect(() => {
    if (!jejumExcedido) {
      alertouJejum.current = false
      return
    }
    if (alertouJejum.current) return
    alertouJejum.current = true
    tocarSom()
    if (notificacoes === 'granted') {
      try {
        new Notification('Tempo máximo sem comer', { body: jejum?.aviso ?? '', tag: 'jejum' })
      } catch {
        // Alguns navegadores móveis não aceitam notificação criada pela página.
      }
    }
  }, [jejumExcedido, jejum?.aviso, tocarSom, notificacoes])

  useEffect(() => {
    document.title =
      tocando.length > 0
        ? 'Hora da insulina - DoceControle'
        : jejumExcedido
          ? 'Tempo sem comer - DoceControle'
          : 'DoceControle'
  }, [tocando.length, jejumExcedido])

  const confirmar = useCallback(
    async (id: number) => {
      try {
        await api.confirmarLembrete(id, dataIso())
        setErro(null)
        await recarregar()
      } catch (e) {
        setErro(mensagemDeErro(e))
      }
    },
    [recarregar],
  )

  const adiar = (id: number) => {
    try {
      localStorage.setItem(chaveAdiado(id, dataIso()), String(Date.now() + ADIAR_MIN * 60_000))
    } catch {
      // Sem armazenamento local, o lembrete simplesmente volta a tocar.
    }
    ultimoToque.current.delete(id)
    setAgora(new Date())
  }

  const pedirNotificacoes = useCallback(async () => {
    if (!('Notification' in window)) return
    setNotificacoes(await Notification.requestPermission())
  }, [])

  return (
    <Contexto.Provider
      value={{ lembretes, jejum, estadoDe, confirmar, recarregar, somLiberado, testarSom: tocarSom, notificacoes, pedirNotificacoes }}
    >
      {jejumExcedido && jejum && (
        <div className="faixa-jejum" role="alert">
          <Icone nome="alerta" />
          <span>
            <strong>Tempo máximo sem comer ultrapassado.</strong> {duracao(jejum.minutos)} desde a última refeição; o
            máximo informado é {duracao(jejum.limiteMin ?? 0)}. {jejum.aviso}
          </span>
          <Link className="botao botao-pequeno" to="/refeicao/nova">
            Registrar refeição
          </Link>
        </div>
      )}
      {children}
      {tocando.length > 0 && (
        <div className="lembrete-fundo">
          <div className="lembrete-alerta" role="alertdialog" aria-modal="false" aria-labelledby="lembrete-titulo">
            <h2 id="lembrete-titulo">
              <Icone nome="sino" tamanho={28} /> Hora da insulina
            </h2>
            {erro && <p className="texto-erro">{erro}</p>}
            <ul className="lista-simples">
              {tocando.map((l) => (
                <li key={l.id} className="lembrete-item">
                  <p>
                    <strong className="lembrete-hora">{l.horario}</strong> {descreverLembrete(l)}
                  </p>
                  <div className="acoes">
                    <button className="botao" onClick={() => void confirmar(l.id)}>
                      Já apliquei
                    </button>
                    <button className="botao botao-secundario" onClick={() => adiar(l.id)}>
                      Adiar {ADIAR_MIN} minutos
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            <p className="texto-apoio">
              Este lembrete só avisa o horário. A dose é a que o seu médico prescreveu.
              {!somLiberado && ' O som começa depois que você tocar na página.'}
            </p>
          </div>
        </div>
      )}
    </Contexto.Provider>
  )
}

export function useLembretes(): ContextoLembretes {
  const contexto = useContext(Contexto)
  if (!contexto) throw new Error('useLembretes precisa estar dentro de ProvedorLembretes.')
  return contexto
}
