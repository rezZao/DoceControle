import { useId, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { api, mensagemDeErro, type Dia, type RefeicaoDoDia, type RegistroRefeicao } from '../api'
import { Anel, Aviso, Carregando, Icone, Medidor, Selo } from '../componentes/Base'
import { SeloGlicemia } from '../componentes/Glicemias'
import { iconeDaRefeicao } from '../icones'
import { descreverLembrete, useLembretes, type EstadoLembrete } from '../componentes/Lembretes'
import { dataIso, dataLonga, duracao, fmt, gramas, horaDe, somarDias, useDados } from '../util'

const rotuloEstado: Record<EstadoLembrete, string> = {
  confirmado: 'Confirmado',
  tocando: 'Tocando agora',
  adiado: 'Adiado',
  atrasado: 'Não confirmado',
  aguardando: 'Aguardando',
  inativo: 'Desativado',
}

/** Navegação entre dias. */
export function SeletorDeDia({ data, aoMudar }: { data: string; aoMudar: (data: string) => void }) {
  const hoje = dataIso()
  return (
    <div className="seletor-dia">
      <button className="botao-icone" onClick={() => aoMudar(somarDias(data, -1))} aria-label="Dia anterior">
        <Icone nome="seta-esq" />
      </button>
      <div>
        <p className="seletor-dia-titulo">{data === hoje ? 'Hoje' : dataLonga(data)}</p>
        {data === hoje ? (
          <p className="texto-apoio">{dataLonga(data)}</p>
        ) : (
          <button className="botao-texto" onClick={() => aoMudar(hoje)}>
            Voltar para hoje
          </button>
        )}
      </div>
      <button
        className="botao-icone"
        onClick={() => aoMudar(somarDias(data, 1))}
        disabled={data >= hoje}
        aria-label="Dia seguinte"
      >
        <Icone nome="seta-dir" />
      </button>
    </div>
  )
}

function ListaRegistros({ registros, aoMudar }: { registros: RegistroRefeicao[]; aoMudar: () => void }) {
  const [erro, setErro] = useState<string | null>(null)

  async function excluir(r: RegistroRefeicao) {
    if (!window.confirm(`Excluir o registro das ${horaDe(r.dataHora)}?`)) return
    try {
      await api.excluirRefeicao(r.id)
      setErro(null)
      aoMudar()
    } catch (e) {
      setErro(mensagemDeErro(e))
    }
  }

  if (registros.length === 0) return null
  return (
    <>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      <ul className="lista-registros">
        {registros.map((r) => (
          <li key={r.id}>
            <div className="registro-linha">
              <span className="registro-hora">{horaDe(r.dataHora)}</span>
              <span className="registro-texto registro-macros">
                <strong>{gramas(r.totalCarbo)}</strong> carbo · {gramas(r.totalProteina)} prot. · {gramas(r.totalGordura)} gord.
              </span>
              <span className="registro-acoes">
                <Link className="botao-icone" to={`/refeicao/${r.id}`} aria-label={`Editar registro das ${horaDe(r.dataHora)}`}>
                  <Icone nome="lapis" />
                </Link>
                <button className="botao-icone" onClick={() => void excluir(r)} aria-label={`Excluir registro das ${horaDe(r.dataHora)}`}>
                  <Icone nome="lixeira" />
                </button>
              </span>
            </div>
            <ul className="registro-itens">
              {r.itens.map((i, n) => (
                <li key={`${i.alimentoId}-${n}`}>
                  <span>
                    {i.nome} <small>{gramas(i.quantidadeG)}</small>
                  </span>
                  <span className="registro-item-carbo">{gramas(i.carbo)}</span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </>
  )
}

/** Os três macronutrientes do dia, sempre no topo. A meta de proteínas só aparece se foi informada (RN04). */
function Macros({ dia }: { dia: Dia }) {
  return (
    <ul className="macros" aria-label="Macronutrientes do dia">
      <li>
        <span className="macro-icone" aria-hidden="true">
          <Icone nome="carbo" />
        </span>
        <span className="macro-nome">Carboidratos</span>
        <strong>
          {fmt(dia.carboConsumido)}
          {dia.carboLimite !== null ? <small> / {fmt(dia.carboLimite)} g</small> : ' g'}
        </strong>
      </li>
      <li>
        <span className="macro-icone" aria-hidden="true">
          <Icone nome="proteina" />
        </span>
        <span className="macro-nome">Proteínas</span>
        <strong>
          {fmt(dia.proteinaConsumida)}
          {dia.proteinaMeta !== null ? <small> / {fmt(dia.proteinaMeta)} g</small> : ' g'}
        </strong>
      </li>
      <li>
        <span className="macro-icone" aria-hidden="true">
          <Icone nome="gordura" />
        </span>
        <span className="macro-nome">Gorduras</span>
        <strong>{fmt(dia.gorduraConsumida)} g</strong>
      </li>
    </ul>
  )
}

/**
 * Uma refeição do dia. Os itens registrados ficam recolhidos: o cartão mostra só o resumo (carboidratos contra o
 * limite, proteínas e gorduras) e abre ao tocar na seta.
 */
function LinhaRefeicao({ r, data, aoMudar }: { r: RefeicaoDoDia; data: string; aoMudar: () => void }) {
  const [aberta, setAberta] = useState(false)
  const idDetalhes = useId()
  const temRegistro = r.registros.length > 0
  const itens = r.registros.reduce((soma, x) => soma + x.itens.length, 0)
  const para = `/refeicao/nova?data=${data}&refeicao=${encodeURIComponent(r.nome)}`

  return (
    <li className="refeicao">
      <div className="refeicao-topo">
        <span className="refeicao-icone" aria-hidden="true">
          <Icone nome={iconeDaRefeicao(r.nome)} />
        </span>
        <div className="refeicao-nome">
          <h3>{r.nome}</h3>
          <p className={`refeicao-sub${r.limiteUltrapassado ? ' refeicao-sub-alerta' : ''}`}>
            {r.horario} ·{' '}
            {r.limiteUltrapassado ? (
              <>
                <Icone nome="alerta" tamanho={16} /> {fmt(r.carboConsumido - r.limiteCarbo)} g acima do limite
              </>
            ) : temRegistro ? (
              <>
                <Icone nome="carbo" tamanho={16} /> {fmt(r.carboConsumido)} de {fmt(r.limiteCarbo)} g
                <span className="so-leitor"> de carboidratos</span>
              </>
            ) : (
              <>
                <Icone nome="carbo" tamanho={16} /> até {fmt(r.limiteCarbo)} g
                <span className="so-leitor"> de carboidratos</span>
              </>
            )}
          </p>
        </div>
        {temRegistro && (
          <button
            type="button"
            className="botao-icone"
            aria-expanded={aberta}
            aria-controls={idDetalhes}
            aria-label={`${aberta ? 'Recolher' : 'Ver'} ${itens === 1 ? 'o item' : `os ${itens} itens`} de ${r.nome}`}
            onClick={() => setAberta((v) => !v)}
          >
            <Icone nome={aberta ? 'recolher' : 'expandir'} />
          </button>
        )}
        <Link className="botao-redondo" to={para} aria-label={`Registrar ${r.nome}`}>
          <Icone nome="mais" />
        </Link>
      </div>
      {temRegistro && (
        <>
          <Medidor rotulo={`Carboidratos de ${r.nome}`} valor={r.carboConsumido} limite={r.limiteCarbo} fino />
          <p className="refeicao-macros">
            <span>
              <Icone nome="proteina" tamanho={18} /> <span className="so-leitor">Proteínas:</span> {fmt(r.proteinaConsumida)} g
            </span>
            <span>
              <Icone nome="gordura" tamanho={18} /> <span className="so-leitor">Gorduras:</span> {fmt(r.gorduraConsumida)} g
            </span>
          </p>
          <div id={idDetalhes} hidden={!aberta}>
            <ListaRegistros registros={r.registros} aoMudar={aoMudar} />
          </div>
        </>
      )}
    </li>
  )
}

/** Tempo desde a última refeição, quando o médico orientou um máximo. Só sinaliza o tempo (RI04). */
function CartaoJejum() {
  const { jejum } = useLembretes()
  if (!jejum || (jejum.estado !== 'Contando' && jejum.estado !== 'Excedido')) return null

  const passou = jejum.estado === 'Excedido'
  const limite = jejum.limiteMin ?? 0
  const texto = passou ? `Passou ${duracao(jejum.minutos - limite)} do máximo` : `Restam ${duracao(jejum.restanteMin)}`

  return (
    <section className={`cartao jejum${passou ? ' jejum-passou' : ''}`} aria-labelledby="titulo-jejum">
      <div className="cartao-linha-topo">
        <h2 id="titulo-jejum" className="cartao-titulo">
          <Icone nome={passou ? 'alerta' : 'relogio'} /> Sem comer
        </h2>
        <p>
          <strong>{duracao(jejum.minutos)}</strong> <span className="texto-apoio">de {duracao(limite)}</span>
        </p>
      </div>
      <div
        className="barra-tempo"
        role="meter"
        aria-label="Tempo sem comer"
        aria-valuemin={0}
        aria-valuemax={limite}
        aria-valuenow={Math.min(jejum.minutos, limite)}
        aria-valuetext={`${duracao(jejum.minutos)} de ${duracao(limite)}. ${texto}.`}
      >
        <div style={{ width: `${limite > 0 ? Math.min(100, (jejum.minutos / limite) * 100) : 0}%` }} />
      </div>
      <p className={passou ? 'jejum-texto-passou' : 'texto-apoio'}>{passou ? jejum.aviso : texto}</p>
    </section>
  )
}

function CartaoLembretes() {
  const { lembretes, estadoDe, confirmar, somLiberado, testarSom, notificacoes, pedirNotificacoes } = useLembretes()
  const ativos = lembretes.filter((l) => l.ativo)
  if (ativos.length === 0) return null

  return (
    <section className="cartao" aria-labelledby="titulo-lembretes">
      <h2 id="titulo-lembretes" className="cartao-titulo">
        <Icone nome="sino" /> Insulina
      </h2>
      <ul className="lista-registros">
        {ativos.map((l) => {
          const estado = estadoDe(l)
          return (
            <li key={l.id}>
              <div className="registro-linha">
                <strong className="registro-hora">{l.horario}</strong>
                <span className="registro-texto">{descreverLembrete(l)}</span>
                <Selo tipo={estado === 'confirmado' ? 'ok' : estado === 'atrasado' || estado === 'tocando' ? 'alerta' : 'neutro'}>
                  {rotuloEstado[estado]}
                </Selo>
                {estado !== 'confirmado' && estado !== 'aguardando' && (
                  <button className="botao botao-pequeno" onClick={() => void confirmar(l.id)}>
                    Já apliquei
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </ul>
      <details className="ajuda">
        <summary>Sobre os avisos</summary>
        <p className="texto-apoio">
          Os lembretes tocam enquanto esta página estiver aberta.{' '}
          {somLiberado ? (
            <button className="botao-texto" onClick={testarSom}>
              Testar o som
            </button>
          ) : (
            'O som é liberado depois do seu primeiro toque na página.'
          )}{' '}
          {notificacoes === 'default' && (
            <button className="botao-texto" onClick={() => void pedirNotificacoes()}>
              Permitir notificações do navegador
            </button>
          )}
          {notificacoes === 'denied' && 'As notificações do navegador estão bloqueadas; o aviso aparece só na página.'}
        </p>
      </details>
    </section>
  )
}

// RF08: painel do dia, com o consumo em relação aos limites, o restante e o aviso de limite ultrapassado.
export function Painel() {
  const [parametros, setParametros] = useSearchParams()
  const local = useLocation()
  const hoje = dataIso()
  const data = parametros.get('data') ?? hoje
  const { dados: dia, erro, recarregar } = useDados(() => api.dia(data), [data])
  const avisosDoRegistro = (local.state as { avisos?: string[]; gravado?: boolean } | null) ?? null

  const mudarDia = (nova: string) => setParametros(nova === hoje ? {} : { data: nova })

  if (erro) return <Aviso tipo="erro">{erro}</Aviso>
  if (!dia) return <Carregando />

  const ultimaGlicemia = dia.glicemias.at(-1)

  return (
    <>
      <h1 className="so-leitor">Painel do dia</h1>
      <SeletorDeDia data={data} aoMudar={mudarDia} />

      {avisosDoRegistro?.gravado && (avisosDoRegistro.avisos?.length ?? 0) === 0 && (
        <Aviso tipo="ok">Refeição registrada.</Aviso>
      )}
      {avisosDoRegistro?.avisos?.map((texto) => (
        <Aviso key={texto} tipo="alerta" titulo="Refeição registrada">
          {texto}
        </Aviso>
      ))}

      {!dia.prescricao ? (
        // RN02: sem limite cadastrado, a dieta não é gerada e o site pede a informação.
        <section className="cartao cartao-destaque">
          <h2>Informe os limites do seu médico</h2>
          <p>
            Para montar a dieta, o DoceControle precisa do limite de carboidratos e da faixa de glicemia que o seu
            médico prescreveu. {data !== hoje && 'Não havia prescrição cadastrada nesta data.'}
          </p>
          <Link className="botao" to="/prescricao">
            Registrar a prescrição
          </Link>
          {(dia.carboConsumido > 0 || dia.proteinaConsumida > 0 || dia.gorduraConsumida > 0) && <Macros dia={dia} />}
        </section>
      ) : (
        <section className="cartao hero" aria-labelledby="titulo-carbo">
          <h2 id="titulo-carbo" className="so-leitor">
            Carboidratos do dia
          </h2>
          <Anel rotulo="Carboidratos do dia" valor={dia.carboConsumido} limite={dia.carboLimite ?? 0} />
          <Macros dia={dia} />
        </section>
      )}

      {data === hoje && <CartaoJejum />}

      {dia.refeicoes.length > 0 && (
        <section aria-labelledby="titulo-refeicoes">
          <h2 id="titulo-refeicoes" className="secao-titulo">
            Refeições
          </h2>
          <ul className="refeicoes">
            {dia.refeicoes.map((r) => (
              <LinhaRefeicao key={r.nome} r={r} data={data} aoMudar={() => void recarregar()} />
            ))}
          </ul>
        </section>
      )}

      {dia.outrosRegistros.length > 0 && (
        <section className="cartao" aria-labelledby="titulo-outros">
          <h2 id="titulo-outros" className="cartao-titulo">
            {dia.prescricao ? 'Outros registros' : 'Registros'}
          </h2>
          <ListaRegistros registros={dia.outrosRegistros} aoMudar={() => void recarregar()} />
        </section>
      )}

      {data === hoje && <CartaoLembretes />}

      <section className="cartao cartao-linha" aria-labelledby="titulo-glicemia">
        <div>
          <h2 id="titulo-glicemia" className="cartao-titulo">
            <Icone nome="gota" /> Glicemia
          </h2>
          {ultimaGlicemia ? (
            <p>
              <strong>{ultimaGlicemia.valor} mg/dL</strong> às {horaDe(ultimaGlicemia.dataHora)}{' '}
              <SeloGlicemia glicemia={ultimaGlicemia} />
            </p>
          ) : (
            <p className="texto-apoio">Nenhuma medição {data === hoje ? 'hoje' : 'neste dia'}.</p>
          )}
        </div>
        {data === hoje && (
          <Link className="botao botao-secundario botao-pequeno" to="/glicemia">
            Registrar
          </Link>
        )}
        {ultimaGlicemia?.aviso && <p className="registro-aviso cartao-linha-aviso">{ultimaGlicemia.aviso}</p>}
      </section>
    </>
  )
}
