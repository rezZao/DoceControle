import { useState } from 'react'
import { api } from '../api'
import { Aviso, Carregando } from '../componentes/Base'
import { SeloGlicemia } from '../componentes/Glicemias'
import { dataCurta, dataIso, duracao, fmt, gramas, horaDe, useDados } from '../util'
import { ResumoPeriodo, TabelaHistorico } from './Historico'

// RF13: relatório para levar à consulta, em formato imprimível.
export function RelatorioPagina() {
  const [periodo, setPeriodo] = useState(14)
  const { dados: r, erro } = useDados(() => api.relatorio(dataIso(), periodo), [periodo])

  return (
    <>
      <div className="nao-imprimir">
        <h1>Relatório para a consulta</h1>
        <div className="abas" role="group" aria-label="Período do relatório">
          {[7, 14, 30, 90].map((n) => (
            <button key={n} type="button" aria-pressed={periodo === n} onClick={() => setPeriodo(n)}>
              {n} dias
            </button>
          ))}
        </div>
        <p>
          <button className="botao" onClick={() => window.print()} disabled={!r}>
            Imprimir ou salvar em PDF
          </button>
        </p>
      </div>

      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {!r ? (
        !erro && <Carregando />
      ) : (
        <article className="relatorio">
          <header>
            <h2>DoceControle · Relatório de acompanhamento</h2>
            <p>
              <strong>{r.nome}</strong> · {dataCurta(r.de)} a {dataCurta(r.ate)} ({r.dias.length} dias) · emitido em{' '}
              {new Date().toLocaleDateString('pt-BR')}
            </p>
            <p className="texto-apoio">
              Dados informados pelo próprio usuário. Os nutrientes foram calculados a partir de uma base nutricional.
            </p>
          </header>

          <section>
            <h3>Prescrição informada pelo usuário</h3>
            {r.prescricaoVigente ? (
              <ul>
                <li>Limite diário de carboidratos: {gramas(r.prescricaoVigente.limiteCarboDia)}</li>
                <li>
                  Faixa de glicemia: {r.prescricaoVigente.glicemiaMin} a {r.prescricaoVigente.glicemiaMax} mg/dL
                </li>
                {r.prescricaoVigente.metaProteinaDia !== null && (
                  <li>Meta diária de proteínas: {gramas(r.prescricaoVigente.metaProteinaDia)}</li>
                )}
                {r.prescricaoVigente.jejumMaxMin !== null && (
                  <li>Tempo máximo sem comer: {duracao(r.prescricaoVigente.jejumMaxMin)}</li>
                )}
                <li>
                  Refeições:{' '}
                  {r.prescricaoVigente.refeicoes.map((m) => `${m.nome} (${m.horario}, ${fmt(m.limiteCarbo)} g)`).join('; ')}
                </li>
                <li>Em vigor desde {dataCurta(r.prescricaoVigente.vigenteDesde)}</li>
              </ul>
            ) : (
              <p>Nenhuma prescrição cadastrada.</p>
            )}
          </section>

          <section>
            <h3>Resumo do período</h3>
            <ResumoPeriodo dias={r.dias} />
          </section>

          <section>
            <h3>Dia a dia</h3>
            <TabelaHistorico dias={r.dias} />
          </section>

          <section>
            <h3>Medições de glicemia</h3>
            {r.glicemias.length === 0 ? (
              <p>Nenhuma medição no período.</p>
            ) : (
              <div className="tabela-rolagem">
                <table className="tabela">
                  <thead>
                    <tr>
                      <th scope="col">Data</th>
                      <th scope="col">Hora</th>
                      <th scope="col" className="num">Valor (mg/dL)</th>
                      <th scope="col">Situação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.glicemias.map((g) => (
                      <tr key={g.id}>
                        <td>{dataCurta(g.dataHora)}</td>
                        <td>{horaDe(g.dataHora)}</td>
                        <td className="num">{g.valor}</td>
                        <td>
                          <SeloGlicemia glicemia={g} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {r.lembretes.length > 0 && (
            <section>
              <h3>Lembretes de insulina</h3>
              <div className="tabela-rolagem">
                <table className="tabela">
                  <thead>
                    <tr>
                      <th scope="col">Horário</th>
                      <th scope="col">Descrição</th>
                      <th scope="col" className="num">Dose informada</th>
                      <th scope="col" className="num">Dias confirmados</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.lembretes.map((l) => (
                      <tr key={l.horario + (l.descricao ?? '')}>
                        <td>{l.horario}</td>
                        <td>{l.descricao ?? 'Insulina'}</td>
                        <td className="num">{l.doseInformada === null ? '—' : `${fmt(l.doseInformada)} un.`}</td>
                        <td className="num">
                          {l.diasConfirmados} de {l.diasNoPeriodo}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="texto-apoio">
                "Confirmado" indica que o usuário marcou o lembrete como aplicado no site.
              </p>
            </section>
          )}

          <footer>
            <p className="texto-apoio">{r.avisoOrientacao}</p>
          </footer>
        </article>
      )}
    </>
  )
}
