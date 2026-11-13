import type { ReactNode } from 'react'
import { fmt } from '../util'

type NomeIcone =
  | 'alerta'
  | 'ok'
  | 'info'
  | 'sino'
  | 'mais'
  | 'lixeira'
  | 'lapis'
  | 'estrela'
  | 'seta-esq'
  | 'seta-dir'
  | 'casa'
  | 'prato'
  | 'gota'
  | 'menu'
  | 'chevron-baixo'
  | 'chevron-dir'
  | 'relogio'

const desenhos: Record<NomeIcone, ReactNode> = {
  alerta: (
    <>
      <path d="M12 3.5 2.5 20h19L12 3.5Z" />
      <path d="M12 10v4.5M12 17.2v.3" />
    </>
  ),
  ok: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12.5 2.7 2.7L16 9.5" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5M12 7.5v.3" />
    </>
  ),
  sino: (
    <>
      <path d="M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 2h-15l1.5-2Z" />
      <path d="M10 21h4" />
    </>
  ),
  mais: <path d="M12 5v14M5 12h14" />,
  lixeira: <path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v5.5M14 11v5.5" />,
  lapis: <path d="m4 20 1-4.5L16.5 4l3.5 3.5L8.5 19 4 20ZM14 6.5l3.5 3.5" />,
  estrela: <path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8L12 3.5Z" />,
  'seta-esq': <path d="M14.5 5.5 8 12l6.5 6.5" />,
  'seta-dir': <path d="M9.5 5.5 16 12l-6.5 6.5" />,
  casa: <path d="M3.5 11 12 4l8.5 7M6 9.5V20h12V9.5M10 20v-5.5h4V20" />,
  prato: (
    <>
      <path d="M12 3v1.5M5.5 11a6.5 6.5 0 0 1 13 0" />
      <path d="M3.5 13h17M5.5 13c.4 3.6 2.8 6.5 6.5 6.5s6.1-2.9 6.5-6.5" />
    </>
  ),
  gota: <path d="M12 3.5c3.2 4 5.5 6.9 5.5 10a5.5 5.5 0 0 1-11 0c0-3.1 2.3-6 5.5-10Z" />,
  menu: <path d="M5 7h14M5 12h14M5 17h14" />,
  'chevron-baixo': <path d="m6 9.5 6 6 6-6" />,
  'chevron-dir': <path d="m9.5 6 6 6-6 6" />,
  relogio: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
}

/** Ícone decorativo: o significado vem sempre do texto ao lado. */
export function Icone({ nome, tamanho = 20 }: { nome: NomeIcone; tamanho?: number }) {
  return (
    <svg
      className="icone"
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {desenhos[nome]}
    </svg>
  )
}

type TipoAviso = 'info' | 'alerta' | 'erro' | 'ok'

/** Mensagem destacada. Erros e alertas são anunciados por leitores de tela. */
export function Aviso({ tipo = 'info', titulo, children }: { tipo?: TipoAviso; titulo?: string; children: ReactNode }) {
  const urgente = tipo === 'erro' || tipo === 'alerta'
  return (
    <div className={`aviso aviso-${tipo}`} role={urgente ? 'alert' : 'status'}>
      <Icone nome={tipo === 'ok' ? 'ok' : tipo === 'info' ? 'info' : 'alerta'} />
      <div>
        {titulo && <strong className="aviso-titulo">{titulo}</strong>}
        <div>{children}</div>
      </div>
    </div>
  )
}

export function Carregando({ texto = 'Carregando…' }: { texto?: string }) {
  return (
    <p className="carregando" role="status">
      {texto}
    </p>
  )
}

/** RN15: aviso de que o site não substitui a orientação médica. */
export function Orientacao({ texto }: { texto: string }) {
  return (
    <p className="orientacao">
      <Icone nome="info" tamanho={18} />
      <span>{texto}</span>
    </p>
  )
}

/**
 * Medidor de consumo em relação a um limite (RF08).
 * Passar do limite muda a cor e também mostra ícone e texto: nunca só a cor.
 */
export function Medidor({
  rotulo,
  valor,
  limite,
  grande = false,
  fino = false,
}: {
  rotulo: string
  valor: number
  limite: number
  grande?: boolean
  /** Barra fina, sem legenda: o texto ao lado já diz o valor. */
  fino?: boolean
}) {
  const passou = valor > limite
  const largura = limite > 0 ? Math.min(100, (valor / limite) * 100) : 0
  const resumo = passou
    ? `${fmt(valor)} g de ${fmt(limite)} g. Limite ultrapassado em ${fmt(valor - limite)} g.`
    : `${fmt(valor)} g de ${fmt(limite)} g. Restam ${fmt(limite - valor)} g.`

  return (
    <div className={`medidor${grande ? ' medidor-grande' : ''}${fino ? ' medidor-fino' : ''}${passou ? ' medidor-passou' : ''}`}>
      <div
        className="medidor-trilho"
        role="meter"
        aria-label={rotulo}
        aria-valuemin={0}
        aria-valuemax={limite}
        aria-valuenow={Math.min(valor, limite)}
        aria-valuetext={resumo}
      >
        <div className="medidor-barra" style={{ width: `${largura}%` }} />
      </div>
      <p className="medidor-legenda" hidden={fino}>
        {passou ? (
          <span className="medidor-alerta">
            <Icone nome="alerta" tamanho={18} />
            Limite ultrapassado em {fmt(valor - limite)} g
          </span>
        ) : (
          <span>Restam {fmt(limite - valor)} g</span>
        )}
        <span className="medidor-total">
          {fmt(valor)} de {fmt(limite)} g
        </span>
      </p>
    </div>
  )
}

/**
 * Anel de progresso: o número em destaque é o que ainda resta do limite.
 * Passando do limite, o anel fica vermelho e o centro mostra quanto passou, com ícone e texto.
 */
export function Anel({ rotulo, valor, limite }: { rotulo: string; valor: number; limite: number }) {
  const passou = valor > limite
  const raio = 52
  const circunferencia = 2 * Math.PI * raio
  const fracao = limite > 0 ? Math.min(1, valor / limite) : 0
  const resumo = passou
    ? `${fmt(valor)} g de ${fmt(limite)} g. Limite ultrapassado em ${fmt(valor - limite)} g.`
    : `${fmt(valor)} g de ${fmt(limite)} g. Restam ${fmt(limite - valor)} g.`

  return (
    <div className={`anel${passou ? ' anel-passou' : ''}`}>
      <svg
        viewBox="0 0 120 120"
        role="meter"
        aria-label={rotulo}
        aria-valuemin={0}
        aria-valuemax={limite}
        aria-valuenow={Math.min(valor, limite)}
        aria-valuetext={resumo}
      >
        <circle className="anel-trilho" cx="60" cy="60" r={raio} />
        {fracao > 0 && (
          <circle
            className="anel-barra"
            cx="60"
            cy="60"
            r={raio}
            transform="rotate(-90 60 60)"
            strokeDasharray={`${circunferencia * fracao} ${circunferencia}`}
          />
        )}
      </svg>
      <div className="anel-centro" aria-hidden="true">
        {passou ? (
          <>
            <span className="anel-valor">+{fmt(valor - limite)}</span>
            <span className="anel-rotulo">
              <Icone nome="alerta" tamanho={16} /> g acima do limite
            </span>
          </>
        ) : (
          <>
            <span className="anel-valor">{fmt(limite - valor)}</span>
            <span className="anel-rotulo">g restantes</span>
          </>
        )}
      </div>
    </div>
  )
}

export function Selo({ tipo, children }: { tipo: 'ia' | 'ok' | 'alerta' | 'neutro' | 'premium'; children: ReactNode }) {
  return <span className={`selo selo-${tipo}`}>{children}</span>
}
