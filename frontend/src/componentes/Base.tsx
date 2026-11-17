import type { ReactNode } from 'react'
import { caminhos, type NomeIcone } from '../icones'
import { fmt } from '../util'

export type { NomeIcone }

export function Icone({ nome, tamanho = 22 }: { nome: NomeIcone; tamanho?: number }) {
  return (
    <svg
      className="icone"
      width={tamanho}
      height={tamanho}
      viewBox="0 -960 960 960"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      {caminhos[nome].map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  )
}

type TipoAviso = 'info' | 'alerta' | 'erro' | 'ok'

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

export function Orientacao({ texto }: { texto: string }) {
  return (
    <p className="orientacao">
      <Icone nome="info" tamanho={18} />
      <span>{texto}</span>
    </p>
  )
}

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
