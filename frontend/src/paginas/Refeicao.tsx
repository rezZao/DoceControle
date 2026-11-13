import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { api, ErroApi, mensagemDeErro, type Alimento, type PropostaAlimento, type Sugestao } from '../api'
import { lerCodigoDeBarras } from '../codigoDeBarras'
import { Aviso, Carregando, Icone, Selo } from '../componentes/Base'
import { NovoAlimento } from '../componentes/NovoAlimento'
import { useConta, useContaAtiva } from '../conta'
import { dataHoraLocal, dataIso, fmt, gramas, lerNumero, nutriente, paraApi, prepararFoto, rolarPara, useDados } from '../util'

interface ItemEdicao {
  chave: number
  alimento: Alimento | null
  /** Como a IA descreveu o alimento (usado quando ela não achou correspondência na base). */
  descricao: string | null
  quantidade: string
  daIA: boolean
}

type Modo = 'texto' | 'foto' | 'manual'

const semAcento = (texto: string) =>
  texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')

let proximaChave = 1

/** RF05: busca na base de alimentos (incluída sempre que uma refeição é registrada). */
function BuscaAlimento({
  base,
  rotulo,
  aoEscolher,
  aoCriar,
  inicial = '',
}: {
  base: Alimento[]
  rotulo: string
  aoEscolher: (alimento: Alimento) => void
  /** Abre o cadastro de um alimento novo, com o que foi digitado na busca. */
  aoCriar: (nome: string) => void
  inicial?: string
}) {
  const [termo, setTermo] = useState(inicial)
  const id = useId()
  const termos = semAcento(termo).split(' ').filter(Boolean)
  const resultados =
    termos.length === 0 ? [] : base.filter((a) => termos.every((t) => semAcento(a.nome).includes(t))).slice(0, 8)

  return (
    <div className="busca">
      <label className="campo" htmlFor={id}>
        <span>{rotulo}</span>
        <input
          id={id}
          type="search"
          autoComplete="off"
          placeholder="Ex.: arroz, banana, pão"
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
        />
      </label>
      {termos.length > 0 && (
        <ul className="busca-resultados" aria-label="Alimentos encontrados">
          {resultados.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => {
                  aoEscolher(a)
                  setTermo('')
                }}
              >
                <strong>{a.nome}</strong>
                <span className="texto-apoio">
                  {a.porcaoDescricao} ({gramas(a.porcaoPadraoG)}) · {gramas(nutriente(a.porcaoPadraoG, a.carboPor100g))} de
                  carboidratos
                </span>
              </button>
            </li>
          ))}
          {resultados.length === 0 && (
            <li className="texto-apoio busca-vazia">Nenhum alimento com esse nome. Tente um nome mais simples ou crie o alimento.</li>
          )}
        </ul>
      )}
      <button type="button" className="botao-texto" onClick={() => aoCriar(termo.trim())}>
        <Icone nome="mais" tamanho={16} /> Não achou? Criar alimento
      </button>
    </div>
  )
}

// RF06 (manual), RF15 e RF16 (IA por texto, com confirmação), RF17 (foto, premium), RF18 (manual sempre disponível).
export function Refeicao() {
  const { id } = useParams()
  const idEdicao = id ? Number(id) : null
  const [parametros] = useSearchParams()
  const navegar = useNavigate()
  const conta = useContaAtiva()
  const { recarregar: recarregarConta } = useConta()

  const dataInicial = parametros.get('data') ?? dataIso()
  const [quando, setQuando] = useState(dataInicial === dataIso() ? dataHoraLocal() : `${dataInicial}T12:00`)
  const [refeicao, setRefeicao] = useState(parametros.get('refeicao') ?? '')
  const [itens, setItens] = useState<ItemEdicao[]>([])
  const [sugestao, setSugestao] = useState<Sugestao | null>(null)
  const [modo, setModo] = useState<Modo>(conta.ia.configurada && conta.ia.consentida ? 'texto' : 'manual')
  const [criando, setCriando] = useState<{
    nome: string
    chave: number | null
    proposta?: PropostaAlimento
    /** Muda a cada pedido, para reabrir (e rolar até) o painel mesmo que ele já esteja aberto. */
    pedido: number
  } | null>(null)
  const [extras, setExtras] = useState<Alimento[]>([])
  const abrirCriacao = (dados: { nome: string; chave: number | null; proposta?: PropostaAlimento }) =>
    setCriando({ ...dados, pedido: Date.now() })
  const [descricao, setDescricao] = useState('')
  const [analisando, setAnalisando] = useState(false)
  const [avisoIA, setAvisoIA] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [gravando, setGravando] = useState(false)
  const [carboOriginal, setCarboOriginal] = useState<{ refeicao: string; carbo: number } | null>(null)
  const campoFoto = useRef<HTMLInputElement>(null)

  const dia = quando.slice(0, 10)
  const { dados: base, erro: erroBase } = useDados(() => api.alimentos('', 400), [])
  const { dados: doDia } = useDados(() => api.dia(dia), [dia])
  const { dados: registro, erro: erroRegistro } = useDados(
    () => (idEdicao ? api.refeicao(idEdicao) : Promise.resolve(null)),
    [idEdicao],
  )

  // Edição (RF12): carrega o registro existente.
  useEffect(() => {
    if (!registro || !base) return
    const porId = new Map(base.map((a) => [a.id, a]))
    setQuando(registro.dataHora.slice(0, 16))
    setRefeicao(registro.refeicao)
    setCarboOriginal({ refeicao: registro.refeicao, carbo: registro.totalCarbo })
    setItens(
      registro.itens.map((i) => ({
        chave: proximaChave++,
        alimento: porId.get(i.alimentoId) ?? null,
        descricao: i.nome,
        quantidade: String(i.quantidadeG),
        daIA: i.daIA,
      })),
    )
  }, [registro, base])

  const metas = doDia?.refeicoes ?? []
  const opcoes = useMemo(() => {
    const nomes = metas.map((m) => m.nome)
    if (refeicao && !nomes.includes(refeicao)) nomes.push(refeicao)
    return nomes
  }, [metas, refeicao])

  // Sem refeição escolhida, sugere a de horário mais próximo.
  useEffect(() => {
    if (refeicao || idEdicao || metas.length === 0) return
    const minutos = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5))
    const agora = minutos(quando.slice(11, 16))
    const maisProxima = [...metas].sort((a, b) => Math.abs(minutos(a.horario) - agora) - Math.abs(minutos(b.horario) - agora))[0]
    setRefeicao(maisProxima.nome)
  }, [metas, refeicao, idEdicao, quando])

  if (erroBase || erroRegistro) return <Aviso tipo="erro">{erroBase ?? erroRegistro}</Aviso>
  if (!base || (idEdicao && !registro)) return <Carregando />

  const catalogo = [...base, ...extras.filter((e) => !base.some((a) => a.id === e.id))]

  const totalCarbo = itens.reduce(
    (soma, i) => soma + (i.alimento ? nutriente(lerNumero(i.quantidade) ?? 0, i.alimento.carboPor100g) : 0),
    0,
  )
  const totalProteina = itens.reduce(
    (soma, i) => soma + (i.alimento ? nutriente(lerNumero(i.quantidade) ?? 0, i.alimento.proteinaPor100g) : 0),
    0,
  )
  const totalGordura = itens.reduce(
    (soma, i) => soma + (i.alimento ? nutriente(lerNumero(i.quantidade) ?? 0, i.alimento.gorduraPor100g) : 0),
    0,
  )
  const meta = metas.find((m) => m.nome === refeicao)
  const jaConsumido = meta
    ? meta.carboConsumido - (carboOriginal && carboOriginal.refeicao === refeicao ? carboOriginal.carbo : 0)
    : 0
  const excesso = meta ? jaConsumido + totalCarbo - meta.limiteCarbo : 0

  const mudarItem = (chave: number, mudanca: Partial<ItemEdicao>) =>
    setItens((lista) => lista.map((i) => (i.chave === chave ? { ...i, ...mudanca } : i)))

  const adicionar = (alimento: Alimento) =>
    setItens((lista) => [
      ...lista,
      { chave: proximaChave++, alimento, descricao: null, quantidade: String(alimento.porcaoPadraoG), daIA: false },
    ])

  // Alimento recém-criado (ou encontrado pelo código de barras): entra na busca e na refeição.
  function aoCriado(alimento: Alimento) {
    setExtras((lista) => (lista.some((a) => a.id === alimento.id) ? lista : [...lista, alimento]))
    const chave = criando?.chave ?? null
    if (chave !== null) {
      const atual = itens.find((i) => i.chave === chave)
      mudarItem(chave, { alimento, quantidade: atual?.quantidade || String(alimento.porcaoPadraoG) })
    } else {
      adicionar(alimento)
    }
    setCriando(null)
    // O painel some e a página encolhe: leva você de volta à lista, onde o alimento acabou de entrar.
    window.setTimeout(() => rolarPara(document.getElementById('titulo-itens'), 'center'), 80)
  }

  function ajustarPorcao(item: ItemEdicao, sentido: 1 | -1) {
    if (!item.alimento) return
    const atual = lerNumero(item.quantidade) ?? 0
    const nova = Math.max(0, atual + sentido * item.alimento.porcaoPadraoG)
    mudarItem(item.chave, { quantidade: String(Math.round(nova * 10) / 10) })
  }

  function receberSugestao(nova: Sugestao) {
    setSugestao(nova)
    // RN17: a sugestão entra na tela marcada como estimativa; só é gravada quando o usuário confirmar.
    setItens((lista) => [
      ...lista.filter((i) => !i.daIA),
      ...nova.itens.map((i) => ({
        chave: proximaChave++,
        alimento: i.alimento,
        descricao: i.descricao,
        quantidade: i.quantidadeG > 0 ? String(i.quantidadeG) : '',
        daIA: true,
      })),
    ])
    setAvisoIA(
      nova.itens.length === 0
        ? 'Nenhum alimento foi identificado. Tente descrever de outro jeito ou escolha os alimentos manualmente.'
        : null,
    )
    void recarregarConta()
  }

  function tratarErroIA(e: unknown) {
    // RN19: se a IA falhar ou o limite diário acabar, o registro manual continua disponível.
    setAvisoIA(mensagemDeErro(e))
    if (e instanceof ErroApi && (e.codigo === 'ia_indisponivel' || e.codigo === 'limite_diario')) setModo('manual')
  }

  async function analisarTexto(evento: FormEvent) {
    evento.preventDefault()
    if (descricao.trim().length < 2) return
    setAnalisando(true)
    setAvisoIA(null)
    try {
      receberSugestao(await api.sugerirPorTexto(descricao))
    } catch (e) {
      tratarErroIA(e)
    } finally {
      setAnalisando(false)
    }
  }

  async function analisarFoto(arquivo: File | undefined) {
    if (!arquivo) return
    setAnalisando(true)
    setAvisoIA(null)
    try {
      // 1) Código de barras, lido no próprio aparelho: se houver, o produto vem do número, sem gastar a IA.
      const codigo = await lerCodigoDeBarras(arquivo)
      if (codigo) {
        try {
          const r = await api.buscarCodigo(codigo)
          if (r.existente) {
            adicionar(r.existente)
            setAvisoIA(`Produto encontrado pelo código de barras: ${r.existente.nome}.`)
            return
          }
          if (r.proposta) {
            abrirCriacao({ nome: r.proposta.nome, chave: null, proposta: r.proposta })
            return
          }
        } catch (e) {
          const seguir = e instanceof ErroApi && (e.codigo === 'produto_nao_encontrado' || e.codigo === 'consulta_indisponivel')
          if (!seguir) throw e
        }
      }
      // 2) Sem código (ou produto desconhecido): a IA identifica os alimentos. A foto é reduzida e
      // reencodada aqui, sem metadados, e não fica guardada (RN22).
      receberSugestao(await api.sugerirPorFoto(await prepararFoto(arquivo)))
    } catch (e) {
      tratarErroIA(e)
    } finally {
      setAnalisando(false)
      if (campoFoto.current) campoFoto.current.value = ''
    }
  }

  async function descartarSugestao() {
    if (!sugestao) return
    try {
      await api.descartarSugestao(sugestao.id)
    } catch {
      // Se não der para avisar o servidor agora, a sugestão é substituída na próxima análise.
    }
    setSugestao(null)
    setItens((lista) => lista.filter((i) => !i.daIA))
  }

  async function gravar(evento: FormEvent) {
    evento.preventDefault()
    if (!refeicao.trim()) return setErro('Escolha a refeição.')
    if (itens.length === 0) return setErro('Inclua pelo menos um alimento.')
    if (itens.some((i) => !i.alimento))
      return setErro('Há alimentos não reconhecidos. Escolha o alimento na base ou remova o item.')
    if (itens.some((i) => !((lerNumero(i.quantidade) ?? 0) > 0)))
      return setErro('Informe a quantidade de cada alimento, em gramas.')

    setGravando(true)
    setErro(null)
    const envio = {
      dataHora: paraApi(quando),
      refeicao: refeicao.trim(),
      itens: itens.map((i) => ({
        alimentoId: i.alimento!.id,
        quantidadeG: lerNumero(i.quantidade)!,
        daSugestao: i.daIA,
      })),
      sugestaoId: sugestao?.id ?? null,
    }
    try {
      const resultado = idEdicao ? await api.atualizarRefeicao(idEdicao, envio) : await api.criarRefeicao(envio)
      const destino = dia === dataIso() ? '/' : `/?data=${dia}`
      navegar(destino, { state: { gravado: true, avisos: resultado.avisos } })
    } catch (e) {
      setErro(mensagemDeErro(e))
      setGravando(false)
    }
  }

  const usosRestantes = Math.max(0, conta.ia.limiteDiario - conta.ia.usosHoje)

  return (
    <>
      <h1>{idEdicao ? 'Alterar refeição' : 'Registrar refeição'}</h1>

      <section className="cartao">
        <div className="formulario-linha">
          {opcoes.length > 0 ? (
            <label className="campo">
              <span>Refeição</span>
              <select value={refeicao} onChange={(e) => setRefeicao(e.target.value)}>
                {opcoes.map((nome) => (
                  <option key={nome}>{nome}</option>
                ))}
              </select>
            </label>
          ) : (
            <label className="campo">
              <span>Refeição</span>
              <input maxLength={40} placeholder="Ex.: Almoço" value={refeicao} onChange={(e) => setRefeicao(e.target.value)} />
            </label>
          )}
          <label className="campo">
            <span>Data e hora</span>
            <input type="datetime-local" required value={quando} onChange={(e) => setQuando(e.target.value)} />
          </label>
        </div>
      </section>

      {criando && (
        <NovoAlimento
          key={criando.pedido}
          nomeInicial={criando.nome}
          propostaInicial={criando.proposta}
          aoPronto={aoCriado}
          aoCancelar={() => setCriando(null)}
        />
      )}

      {!idEdicao && (
        <section className="cartao" aria-labelledby="titulo-como">
          <h2 id="titulo-como">Como você quer registrar?</h2>
          <div className="abas" role="group" aria-label="Forma de registro">
            <button type="button" aria-pressed={modo === 'texto'} onClick={() => setModo('texto')}>
              Descrever
            </button>
            <button type="button" aria-pressed={modo === 'foto'} onClick={() => setModo('foto')}>
              Foto <Selo tipo="premium">Premium</Selo>
            </button>
            <button type="button" aria-pressed={modo === 'manual'} onClick={() => setModo('manual')}>
              Escolher alimentos
            </button>
          </div>

          {avisoIA && <Aviso tipo="alerta">{avisoIA}</Aviso>}

          {modo !== 'manual' && !conta.ia.configurada && (
            <Aviso tipo="info" titulo="A IA ainda não foi configurada neste servidor">
              O registro por descrição e por foto precisa de um provedor de IA. O registro manual continua disponível.
            </Aviso>
          )}

          {modo !== 'manual' && conta.ia.configurada && !conta.ia.consentida && (
            // RN20: sem o consentimento específico, o registro por IA fica desativado.
            <Aviso tipo="info" titulo="O registro com IA está desativado">
              Para usar, é preciso consentir com o envio do conteúdo da refeição à IA.{' '}
              <Link to="/conta">Ativar na sua conta</Link>. O registro manual continua disponível.
            </Aviso>
          )}

          {modo === 'texto' && conta.ia.configurada && conta.ia.consentida && (
            <form onSubmit={analisarTexto} className="formulario">
              <label className="campo">
                <span>O que você comeu?</span>
                <textarea
                  rows={3}
                  maxLength={600}
                  placeholder="Ex.: 2 fatias de pão integral, 1 ovo cozido e café com leite"
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                />
              </label>
              <div className="acoes">
                <button className="botao" disabled={analisando || descricao.trim().length < 2 || usosRestantes === 0}>
                  {analisando ? 'Identificando…' : 'Identificar alimentos'}
                </button>
                <span className="texto-apoio">
                  {usosRestantes} de {conta.ia.limiteDiario} usos restantes hoje
                </span>
              </div>
            </form>
          )}

          {modo === 'foto' && conta.ia.configurada && conta.ia.consentida && (
            // RF20 / RN23: a foto é exclusiva do plano premium; o texto segue gratuito.
            <>
              {!conta.ia.fotoLiberada ? (
                <Aviso tipo="info" titulo="O registro por foto faz parte do plano premium">
                  O registro por texto e o manual continuam gratuitos. <Link to="/conta">Conhecer o premium</Link>
                </Aviso>
              ) : (
                <div className="formulario">
                  <label className="campo">
                    <span>Foto da refeição</span>
                    <input
                      ref={campoFoto}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      disabled={analisando || usosRestantes === 0}
                      onChange={(e) => void analisarFoto(e.target.files?.[0])}
                    />
                  </label>
                  <p className="texto-apoio">
                    {analisando
                      ? 'Identificando os alimentos…'
                      : 'Se a foto tiver um código de barras, ele é lido no seu aparelho e o produto é buscado pelo número. Senão, a IA identifica os alimentos. A foto é enviada sem dados de localização e não fica guardada.'}{' '}
                    {usosRestantes} de {conta.ia.limiteDiario} usos restantes hoje.
                  </p>
                </div>
              )}
            </>
          )}

          {modo === 'manual' && (
            <BuscaAlimento
              base={catalogo}
              rotulo="Buscar alimento"
              aoEscolher={adicionar}
              aoCriar={(nome) => abrirCriacao({ nome, chave: null })}
            />
          )}
        </section>
      )}

      <form onSubmit={gravar}>
        <section className="cartao" aria-labelledby="titulo-itens">
          <h2 id="titulo-itens">Alimentos desta refeição</h2>

          {sugestao && itens.some((i) => i.daIA) && (
            // RNF12: tudo o que veio da IA e ainda não foi confirmado fica identificado.
            <div className="faixa-ia">
              <p>
                <Selo tipo="ia">Estimativa da IA</Selo> Confira cada alimento e cada quantidade. Nada foi gravado ainda.
              </p>
              <button type="button" className="botao-texto" onClick={() => void descartarSugestao()}>
                Descartar sugestão
              </button>
            </div>
          )}

          {itens.length === 0 ? (
            <p className="texto-apoio">Nenhum alimento ainda.</p>
          ) : (
            <ul className="lista-itens">
              {itens.map((item) => (
                <li key={item.chave} className={item.alimento ? '' : 'item-pendente'}>
                  {item.alimento ? (
                    <>
                      <div className="item-topo">
                        <span>
                          <strong>{item.alimento.nome}</strong> {item.daIA && <Selo tipo="ia">IA</Selo>}
                          <br />
                          <span className="texto-apoio">
                            {item.alimento.porcaoDescricao} = {gramas(item.alimento.porcaoPadraoG)}
                          </span>
                        </span>
                        <button
                          type="button"
                          className="botao-icone"
                          onClick={() => setItens((l) => l.filter((i) => i.chave !== item.chave))}
                          aria-label={`Remover ${item.alimento.nome}`}
                        >
                          <Icone nome="lixeira" />
                        </button>
                      </div>
                      <div className="item-quantidade">
                        <button type="button" className="botao botao-secundario botao-pequeno" onClick={() => ajustarPorcao(item, -1)}>
                          − porção
                        </button>
                        <label className="campo campo-curto">
                          <span className="so-leitor">Quantidade de {item.alimento.nome}, em gramas</span>
                          <input
                            inputMode="decimal"
                            value={item.quantidade}
                            onChange={(e) => mudarItem(item.chave, { quantidade: e.target.value.replace(/[^\d.,]/g, '') })}
                          />
                        </label>
                        <span aria-hidden="true">g</span>
                        <button type="button" className="botao botao-secundario botao-pequeno" onClick={() => ajustarPorcao(item, 1)}>
                          + porção
                        </button>
                        <span className="item-carbo">
                          {gramas(nutriente(lerNumero(item.quantidade) ?? 0, item.alimento.carboPor100g))} carbo
                        </span>
                      </div>
                    </>
                  ) : (
                    // RN18: alimento que a IA não reconheceu é sinalizado e o usuário escolhe manualmente.
                    <>
                      <div className="item-topo">
                        <span>
                          <Selo tipo="alerta">
                            <Icone nome="alerta" tamanho={14} /> Não reconhecido
                          </Selo>{' '}
                          <strong>{item.descricao}</strong>
                        </span>
                        <button
                          type="button"
                          className="botao-icone"
                          onClick={() => setItens((l) => l.filter((i) => i.chave !== item.chave))}
                          aria-label={`Remover ${item.descricao}`}
                        >
                          <Icone nome="lixeira" />
                        </button>
                      </div>
                      <BuscaAlimento
                        base={catalogo}
                        rotulo="Escolha o alimento na base"
                        inicial={item.descricao ?? ''}
                        aoCriar={(nome) => abrirCriacao({ nome: nome || item.descricao || '', chave: item.chave })}
                        aoEscolher={(alimento) =>
                          mudarItem(item.chave, {
                            alimento,
                            quantidade: item.quantidade || String(alimento.porcaoPadraoG),
                          })
                        }
                      />
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}

          {(idEdicao || modo !== 'manual') && (
            <details className="adicionar-mais">
              <summary>Adicionar outro alimento</summary>
              <BuscaAlimento
                base={catalogo}
                rotulo="Buscar alimento"
                aoEscolher={adicionar}
                aoCriar={(nome) => abrirCriacao({ nome, chave: null })}
              />
            </details>
          )}
        </section>

        <section className="cartao cartao-destaque" aria-live="polite">
          <p className="numero-medio">
            {gramas(totalCarbo)} <span>de carboidratos · {gramas(totalProteina)} de proteínas · {gramas(totalGordura)} de gorduras</span>
          </p>
          {meta && (
            <p>
              Com este registro, {meta.nome} fica com {fmt(jaConsumido + totalCarbo)} g de {fmt(meta.limiteCarbo)} g.
            </p>
          )}
          {meta && excesso > 0.05 && (
            // RN07: passar do limite avisa, mas nunca bloqueia o registro.
            <Aviso tipo="alerta" titulo={`Passa do limite desta refeição em ${fmt(excesso)} g`}>
              Você pode gravar mesmo assim: o registro mostra o que foi comido.
            </Aviso>
          )}
          {erro && <Aviso tipo="erro">{erro}</Aviso>}
          <div className="acoes">
            <button className="botao botao-largo" disabled={gravando || itens.length === 0}>
              {gravando ? 'Gravando…' : sugestao ? 'Confirmar e gravar' : idEdicao ? 'Salvar alterações' : 'Gravar refeição'}
            </button>
            <Link className="botao botao-secundario" to="/">
              Cancelar
            </Link>
          </div>
        </section>
      </form>
    </>
  )
}
