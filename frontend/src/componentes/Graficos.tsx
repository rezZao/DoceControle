import { useState, type ReactNode } from 'react'
import type { DiaHistorico } from '../api'
import { dataCurta, diaDaSemana, fmt } from '../util'

// gráficos do histórico, com a mesma informação em tabela logo abaixo

const L = 640
const A = 230
const M = { esq: 40, dir: 12, topo: 26, base: 34 }
const AREA_L = L - M.esq - M.dir
const AREA_A = A - M.topo - M.base

function topoLimpo(valor: number): number {
  if (valor <= 0) return 10
  const passo = Math.pow(10, Math.floor(Math.log10(valor)))
  const candidatos = [1, 1.5, 2, 2.5, 3, 4, 5, 10].map((m) => m * passo)
  return candidatos.find((c) => c >= valor) ?? valor
}

function Moldura({
  titulo,
  dias,
  topo,
  piso = 0,
  unidade,
  dica,
  legenda,
  children,
}: {
  titulo: string
  dias: DiaHistorico[]
  topo: number
  piso?: number
  unidade: string
  dica: (dia: DiaHistorico) => ReactNode
  legenda: ReactNode
  children: (y: (valor: number) => number, x: (indice: number) => number, faixa: number) => ReactNode
}) {
  const [ativo, setAtivo] = useState<number | null>(null)
  const faixa = AREA_L / dias.length
  const x = (i: number) => M.esq + faixa * i + faixa / 2
  const y = (v: number) => M.topo + AREA_A - ((v - piso) / (topo - piso)) * AREA_A
  const marcas = [0, 0.25, 0.5, 0.75, 1].map((p) => piso + (topo - piso) * p)
  const pulo = Math.ceil(dias.length / 8)

  return (
    <figure className="grafico">
      <figcaption>
        <strong>{titulo}</strong>
        <div className="grafico-legenda">{legenda}</div>
      </figcaption>
      <div className="grafico-area">
        <svg viewBox={`0 0 ${L} ${A}`} role="group" aria-label={titulo}>
          {marcas.map((m) => (
            <g key={m}>
              <line className="grafico-grade" x1={M.esq} x2={L - M.dir} y1={y(m)} y2={y(m)} />
              <text className="grafico-eixo" x={M.esq - 6} y={y(m) + 4} textAnchor="end">
                {fmt(m)}
              </text>
            </g>
          ))}
          <line className="grafico-base" x1={M.esq} x2={L - M.dir} y1={y(piso)} y2={y(piso)} />
          <text className="grafico-eixo" x={2} y={11} textAnchor="start">
            {unidade}
          </text>

          {children(y, x, faixa)}

          {dias.map((d, i) => (
            <g key={d.data}>
              {i % pulo === 0 && (
                <text className="grafico-eixo" x={x(i)} y={A - 18} textAnchor="middle">
                  {dias.length <= 8 ? diaDaSemana(d.data) : dataCurta(d.data)}
                </text>
              )}
              {dias.length <= 8 && (
                <text className="grafico-eixo" x={x(i)} y={A - 4} textAnchor="middle">
                  {dataCurta(d.data)}
                </text>
              )}
              <rect
                className="grafico-toque"
                x={M.esq + faixa * i}
                y={M.topo}
                width={faixa}
                height={AREA_A}
                tabIndex={0}
                role="img"
                aria-label={`${dataCurta(d.data)}`}
                onMouseEnter={() => setAtivo(i)}
                onMouseLeave={() => setAtivo(null)}
                onFocus={() => setAtivo(i)}
                onBlur={() => setAtivo(null)}
              />
            </g>
          ))}
        </svg>
        {ativo !== null && (
          <div
            className="grafico-dica"
            role="status"
            style={{ left: `${(x(ativo) / L) * 100}%`, transform: `translateX(${ativo > dias.length / 2 ? '-105%' : '5%'})` }}
          >
            <strong>
              {diaDaSemana(dias[ativo].data)}, {dataCurta(dias[ativo].data)}
            </strong>
            {dica(dias[ativo])}
          </div>
        )}
      </div>
    </figure>
  )
}

export function GraficoCarbo({ dias }: { dias: DiaHistorico[] }) {
  const maior = Math.max(...dias.map((d) => Math.max(d.carboConsumido, d.carboLimite ?? 0)), 1)
  const topo = topoLimpo(maior * 1.05)

  return (
    <Moldura
      titulo="Carboidratos por dia"
      dias={dias}
      topo={topo}
      unidade="g"
      legenda={
        <>
          <span><i className="chave chave-serie" /> Dentro do limite</span>
          <span><i className="chave chave-critico" /> Acima do limite</span>
          <span><i className="chave chave-linha" /> Limite prescrito</span>
        </>
      }
      dica={(d) => (
        <>
          <span>Consumo: {fmt(d.carboConsumido)} g</span>
          {d.carboLimite !== null && <span>Limite: {fmt(d.carboLimite)} g</span>}
          {d.limiteUltrapassado && <span>Limite ultrapassado</span>}
        </>
      )}
    >
      {(y, x, faixa) => {
        const largura = Math.min(24, Math.max(4, faixa - 4))
        return (
          <>
            {dias.map((d, i) => {
              if (d.carboConsumido <= 0) return null
              const alto = y(0) - y(d.carboConsumido)
              const raio = Math.min(4, alto, largura / 2)
              const esq = x(i) - largura / 2
              return (
                <path
                  key={d.data}
                  className={d.limiteUltrapassado ? 'marca-critico' : 'marca-serie'}
                  d={`M${esq},${y(0)} V${y(d.carboConsumido) + raio} q0,${-raio} ${raio},${-raio} H${esq + largura - raio} q${raio},0 ${raio},${raio} V${y(0)} Z`}
                />
              )
            })}
            {dias.map(
              (d, i) =>
                d.carboLimite !== null && (
                  <line
                    key={d.data}
                    className="marca-limite"
                    x1={x(i) - faixa / 2 + 1}
                    x2={x(i) + faixa / 2 - 1}
                    y1={y(d.carboLimite)}
                    y2={y(d.carboLimite)}
                  />
                ),
            )}
          </>
        )
      }}
    </Moldura>
  )
}

export function GraficoGlicemia({ dias }: { dias: DiaHistorico[] }) {
  const comMedicao = dias.filter((d) => d.medicoes > 0)
  if (comMedicao.length === 0) return null

  const valores = dias.flatMap((d) => [d.glicemiaMax ?? 0, d.faixaMax ?? 0])
  const topo = topoLimpo(Math.max(...valores) * 1.05)

  return (
    <Moldura
      titulo="Glicemia por dia"
      dias={dias}
      topo={topo}
      unidade="mg/dL"
      legenda={
        <>
          <span><i className="chave chave-ponto" /> Média do dia (traço: mínima e máxima)</span>
          <span><i className="chave chave-critico-ponto" /> Dia com medição fora da faixa</span>
          <span><i className="chave chave-faixa" /> Faixa prescrita</span>
        </>
      }
      dica={(d) =>
        d.medicoes === 0 ? (
          <span>Sem medições</span>
        ) : (
          <>
            <span>Média: {fmt(d.glicemiaMedia ?? 0)} mg/dL</span>
            <span>
              Mínima {d.glicemiaMin} · Máxima {d.glicemiaMax}
            </span>
            <span>
              {d.medicoes} {d.medicoes === 1 ? 'medição' : 'medições'}
              {d.medicoesForaDaFaixa > 0 && `, ${d.medicoesForaDaFaixa} fora da faixa`}
            </span>
          </>
        )
      }
    >
      {(y, x, faixa) => (
        <>
          {dias.map(
            (d, i) =>
              d.faixaMin !== null &&
              d.faixaMax !== null && (
                <rect
                  key={d.data}
                  className="marca-faixa"
                  x={x(i) - faixa / 2}
                  width={faixa}
                  y={y(d.faixaMax)}
                  height={y(d.faixaMin) - y(d.faixaMax)}
                />
              ),
          )}
          {dias.map((d, i) => {
            if (d.medicoes === 0 || d.glicemiaMin === null || d.glicemiaMax === null || d.glicemiaMedia === null) return null
            const classe = d.medicoesForaDaFaixa > 0 ? 'marca-critico' : 'marca-serie'
            return (
              <g key={d.data}>
                <line className={`${classe} marca-traco`} x1={x(i)} x2={x(i)} y1={y(d.glicemiaMin)} y2={y(d.glicemiaMax)} />
                <circle className={`${classe} marca-ponto`} cx={x(i)} cy={y(d.glicemiaMedia)} r={5} />
              </g>
            )
          })}
        </>
      )}
    </Moldura>
  )
}
