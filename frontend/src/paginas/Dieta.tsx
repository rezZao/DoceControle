import { Link } from 'react-router-dom'
import { api } from '../api'
import { Aviso, Carregando, Icone, Orientacao } from '../componentes/Base'
import { iconeDaRefeicao } from '../icones'
import { dataIso, duracao, fmt, useDados } from '../util'

const MAX_IDEIAS = 4

// dieta do dia: o limite é dividido entre as refeições e cada uma abre ao tocar
export function Dieta() {
  const { dados: dia, erro } = useDados(() => api.dia(dataIso()), [])

  if (erro) return <Aviso tipo="erro">{erro}</Aviso>
  if (!dia) return <Carregando />

  if (!dia.prescricao) {
    return (
      <>
        <h1>Dieta</h1>
        <section className="cartao cartao-destaque">
          <h2>A dieta precisa dos limites do seu médico</h2>
          <p>
            O DoceControle não usa valores padrão: a dieta só é montada a partir do limite de carboidratos que o seu
            médico prescreveu.
          </p>
          <Link className="botao" to="/prescricao">
            Registrar a prescrição
          </Link>
        </section>
      </>
    )
  }

  const prescricao = dia.prescricao
  // Abre por padrão a próxima refeição do dia (ou a última, se todas já passaram).
  const agora = new Date()
  const hora = `${String(agora.getHours()).padStart(2, '0')}:${String(agora.getMinutes()).padStart(2, '0')}`
  const indice = dia.refeicoes.findIndex((r) => r.horario >= hora)
  const aberta = indice === -1 ? dia.refeicoes.length - 1 : indice

  return (
    <>
      <h1>Dieta</h1>

      <section className="cartao plano-resumo">
        <p className="plano-total">
          <strong>{fmt(prescricao.limiteCarboDia)} g</strong> de carboidratos por dia
        </p>
        <ul className="chips" aria-label="Resumo da prescrição">
          <li>
            {dia.refeicoes.length} {dia.refeicoes.length === 1 ? 'refeição' : 'refeições'}
          </li>
          {prescricao.metaProteinaDia !== null && <li>Proteínas: {fmt(prescricao.metaProteinaDia)} g</li>}
          {prescricao.jejumMaxMin !== null && <li>Sem comer até {duracao(prescricao.jejumMaxMin)}</li>}
          <li>{prescricao.divisaoPersonalizada ? 'Divisão ajustada' : 'Partes iguais'}</li>
        </ul>
        <Link className="botao-texto" to="/prescricao">
          Alterar prescrição
        </Link>
      </section>

      <ul className="plano">
        {dia.refeicoes.map((r, i) => (
          <li key={r.nome}>
            <details className="plano-item" name="plano" open={i === aberta || undefined}>
              <summary>
                <span className="refeicao-icone" aria-hidden="true">
                  <Icone nome={iconeDaRefeicao(r.nome)} />
                </span>
                <span className="plano-nome">
                  <strong>{r.nome}</strong>
                  <span className={`plano-sub${r.limiteUltrapassado ? ' plano-sub-alerta' : ''}`}>
                    {r.horario}
                    {r.carboConsumido > 0 && (
                      <>
                        {' · '}
                        {r.limiteUltrapassado ? (
                          <>
                            <Icone nome="alerta" tamanho={14} /> Acima do limite
                          </>
                        ) : (
                          `Restam ${fmt(r.carboRestante)} g`
                        )}
                      </>
                    )}
                  </span>
                </span>
                <span className="plano-limite">
                  {fmt(r.limiteCarbo)} <small>g</small>
                </span>
                <Icone nome="chevron-baixo" tamanho={20} />
              </summary>

              <div className="plano-corpo">
                {r.metaProteina !== null && <p className="plano-proteina">Proteínas: {fmt(r.metaProteina)} g</p>}

                {r.exemplos.length > 0 ? (
                  <>
                    <p className="plano-titulo">Ideias que cabem</p>
                    <ul className="ideias">
                      {r.exemplos.slice(0, MAX_IDEIAS).map((e) => (
                        <li key={e.alimentoId}>
                          <span>
                            {e.nome}
                            <small>{e.porcao}</small>
                          </span>
                          <b>{fmt(e.carbo)} g</b>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p className="texto-apoio">
                    {r.carboRestante <= 0
                      ? 'O limite desta refeição já foi atingido.'
                      : 'Nenhuma porção de exemplo cabe no restante desta refeição.'}
                  </p>
                )}

                <Link
                  className="botao botao-secundario botao-pequeno"
                  to={`/refeicao/nova?data=${dia.data}&refeicao=${encodeURIComponent(r.nome)}`}
                >
                  <Icone nome="mais" tamanho={18} /> Registrar
                </Link>
              </div>
            </details>
          </li>
        ))}
      </ul>

      <p className="texto-apoio">Cada ideia cabe sozinha no que resta da refeição. Combinando alimentos, some os carboidratos.</p>
      <Orientacao texto={dia.avisoOrientacao} />
    </>
  )
}
