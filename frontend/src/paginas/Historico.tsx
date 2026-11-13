import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type DiaHistorico } from '../api'
import { Aviso, Carregando, Icone, Selo } from '../componentes/Base'
import { GraficoCarbo, GraficoGlicemia } from '../componentes/Graficos'
import { dataCurta, dataIso, diaDaSemana, fmt, gramas, useDados } from '../util'

/** A mesma informação dos gráficos, em tabela (também usada no relatório). */
export function TabelaHistorico({ dias, comLinks = false }: { dias: DiaHistorico[]; comLinks?: boolean }) {
  return (
    <div className="tabela-rolagem">
      <table className="tabela">
        <thead>
          <tr>
            <th scope="col">Dia</th>
            <th scope="col" className="num">Carboidratos</th>
            <th scope="col" className="num">Limite</th>
            <th scope="col" className="num">Proteínas</th>
            <th scope="col" className="num">Glicemia (mín. – máx.)</th>
            <th scope="col" className="num">Fora da faixa</th>
          </tr>
        </thead>
        <tbody>
          {[...dias].reverse().map((d) => (
            <tr key={d.data}>
              <th scope="row">
                {comLinks ? (
                  <Link to={`/?data=${d.data}`}>
                    {diaDaSemana(d.data)}, {dataCurta(d.data)}
                  </Link>
                ) : (
                  `${diaDaSemana(d.data)}, ${dataCurta(d.data)}`
                )}
              </th>
              <td className="num">
                {d.refeicoes === 0 ? '—' : gramas(d.carboConsumido)}
                {d.limiteUltrapassado && (
                  <>
                    {' '}
                    <Selo tipo="alerta">
                      <Icone nome="alerta" tamanho={14} /> acima
                    </Selo>
                  </>
                )}
              </td>
              <td className="num">{d.carboLimite === null ? '—' : gramas(d.carboLimite)}</td>
              <td className="num">{d.refeicoes === 0 ? '—' : gramas(d.proteinaConsumida)}</td>
              <td className="num">{d.medicoes === 0 ? '—' : `${d.glicemiaMin} – ${d.glicemiaMax}`}</td>
              <td className="num">{d.medicoes === 0 ? '—' : `${d.medicoesForaDaFaixa} de ${d.medicoes}`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function ResumoPeriodo({ dias }: { dias: DiaHistorico[] }) {
  const comRegistro = dias.filter((d) => d.refeicoes > 0)
  const comLimite = comRegistro.filter((d) => d.carboLimite !== null)
  const medicoes = dias.reduce((s, d) => s + d.medicoes, 0)
  const fora = dias.reduce((s, d) => s + d.medicoesForaDaFaixa, 0)
  const mediaCarbo = comRegistro.length ? comRegistro.reduce((s, d) => s + d.carboConsumido, 0) / comRegistro.length : null

  return (
    <dl className="resumo">
      <div>
        <dt>Dias com refeições registradas</dt>
        <dd>
          {comRegistro.length} de {dias.length}
        </dd>
      </div>
      <div>
        <dt>Média de carboidratos por dia registrado</dt>
        <dd>{mediaCarbo === null ? '—' : gramas(mediaCarbo)}</dd>
      </div>
      <div>
        <dt>Dias acima do limite</dt>
        <dd>
          {comLimite.filter((d) => d.limiteUltrapassado).length} de {comLimite.length}
        </dd>
      </div>
      <div>
        <dt>Medições de glicemia fora da faixa</dt>
        <dd>{medicoes === 0 ? '—' : `${fmt(fora)} de ${fmt(medicoes)}`}</dd>
      </div>
    </dl>
  )
}

// RF11: histórico diário e semanal de consumo e de glicemia.
export function Historico() {
  const [periodo, setPeriodo] = useState(7)
  const { dados: dias, erro } = useDados(() => api.historico(dataIso(), periodo), [periodo])

  return (
    <>
      <h1>Histórico</h1>
      <div className="abas" role="group" aria-label="Período">
        {[7, 14, 30].map((n) => (
          <button key={n} type="button" aria-pressed={periodo === n} onClick={() => setPeriodo(n)}>
            {n} dias
          </button>
        ))}
      </div>

      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {!dias ? (
        !erro && <Carregando />
      ) : (
        <>
          <section className="cartao">
            <ResumoPeriodo dias={dias} />
          </section>
          <section className="cartao">
            <GraficoCarbo dias={dias} />
          </section>
          {dias.some((d) => d.medicoes > 0) && (
            <section className="cartao">
              <GraficoGlicemia dias={dias} />
            </section>
          )}
          <section className="cartao" aria-labelledby="titulo-tabela">
            <h2 id="titulo-tabela">Dia a dia</h2>
            <p className="texto-apoio">Cada dia é comparado com os limites que valiam naquela data.</p>
            <TabelaHistorico dias={dias} comLinks />
          </section>
          <p>
            <Link className="botao botao-secundario" to="/relatorio">
              Gerar relatório para a consulta
            </Link>
          </p>
        </>
      )}
    </>
  )
}
