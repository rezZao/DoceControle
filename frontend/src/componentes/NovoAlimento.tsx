import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api, mensagemDeErro, type Alimento, type NovoAlimento as Envio, type PropostaAlimento } from '../api'
import { lerCodigoDeBarras } from '../codigoDeBarras'
import { useContaAtiva } from '../conta'
import { fmt, lerNumero, prepararFoto } from '../util'
import { Aviso, Icone, Selo } from './Base'

type Modo = 'manual' | 'ia' | 'codigo'

/**
 * Criar um alimento novo: manualmente, com a ajuda da IA ou a partir do código de barras.
 * Em qualquer caminho os valores aparecem no formulário para o usuário conferir e corrigir antes de salvar.
 * Os alimentos criados valem só para a conta dele e entram no cálculo como os demais (RN06).
 */
export function NovoAlimento({
  nomeInicial = '',
  propostaInicial,
  aoPronto,
  aoCancelar,
}: {
  nomeInicial?: string
  /** Dados já lidos (por exemplo, de um código de barras) para abrir o formulário preenchido. */
  propostaInicial?: PropostaAlimento
  /** Chamado com o alimento recém-criado ou, se o código já existia, com o alimento encontrado. */
  aoPronto: (alimento: Alimento) => void
  aoCancelar: () => void
}) {
  const conta = useContaAtiva()
  const [modo, setModo] = useState<Modo>(propostaInicial ? 'codigo' : 'manual')
  const [nome, setNome] = useState(nomeInicial)
  const [categoria, setCategoria] = useState('')
  const [carbo, setCarbo] = useState('')
  const [proteina, setProteina] = useState('')
  const [porcaoG, setPorcaoG] = useState('100')
  const [porcaoDescricao, setPorcaoDescricao] = useState('')
  const [origem, setOrigem] = useState<Envio['origem']>('Manual')
  const [codigo, setCodigo] = useState<string | null>(null)
  const [observacao, setObservacao] = useState<string | null>(null)
  const [preenchido, setPreenchido] = useState(false)

  const [descricaoIA, setDescricaoIA] = useState(nomeInicial)
  const [digitos, setDigitos] = useState('')
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const campoNome = useRef<HTMLInputElement>(null)

  const ia = conta.ia
  const iaDisponivel = ia.configurada && ia.consentida
  const usosRestantes = Math.max(0, ia.limiteDiario - ia.usosHoje)

  function preencher(p: PropostaAlimento) {
    setNome(p.nome)
    setCategoria(p.categoria)
    setCarbo(p.carboPor100g === null ? '' : String(p.carboPor100g))
    setProteina(p.proteinaPor100g === null ? '' : String(p.proteinaPor100g))
    setPorcaoG(String(p.porcaoPadraoG))
    setPorcaoDescricao(p.porcaoDescricao)
    setOrigem(p.origem === 'Base' ? 'Manual' : p.origem)
    setCodigo(p.codigoBarras)
    setObservacao(p.observacao)
    setPreenchido(true)
    setErro(null)
    window.setTimeout(() => campoNome.current?.focus(), 0)
  }

  useEffect(() => {
    if (propostaInicial) preencher(propostaInicial)
    // Só na abertura: o formulário passa a ser do usuário.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function executar(rotulo: string, acao: () => Promise<void>) {
    setOcupado(rotulo)
    setErro(null)
    setAviso(null)
    try {
      await acao()
    } catch (e) {
      setErro(mensagemDeErro(e))
    } finally {
      setOcupado(null)
    }
  }

  const estimarPorTexto = () =>
    executar('Estimando…', async () => {
      const r = await api.estimarAlimentoPorTexto(descricaoIA)
      preencher(r.proposta)
    })

  const estimarPorFoto = (arquivo: File | undefined) =>
    arquivo &&
    executar('Lendo a foto…', async () => {
      // Foto do alimento ou do rótulo; vai reduzida, sem metadados, e não fica guardada (RN22).
      const r = await api.estimarAlimentoPorFoto(await prepararFoto(arquivo, 1600), descricaoIA.trim() || null)
      preencher(r.proposta)
    })

  async function consultarCodigo(numeros: string) {
    const r = await api.buscarCodigo(numeros)
    if (r.existente) {
      setAviso(`Este código já está cadastrado como “${r.existente.nome}”.`)
      aoPronto(r.existente)
    } else if (r.proposta) {
      preencher(r.proposta)
    }
  }

  const lerFotoDoCodigo = (arquivo: File | undefined) =>
    arquivo &&
    executar('Lendo o código…', async () => {
      const numeros = await lerCodigoDeBarras(arquivo)
      if (!numeros) {
        setErro('Não encontrei um código de barras nessa foto. Chegue mais perto, com boa luz, ou digite os números.')
        return
      }
      await consultarCodigo(numeros)
    })

  const buscarDigitos = (evento: FormEvent) => {
    evento.preventDefault()
    void executar('Buscando…', () => consultarCodigo(digitos.replace(/\D/g, '')))
  }

  async function salvar(evento: FormEvent) {
    evento.preventDefault()
    const c = lerNumero(carbo)
    const p = lerNumero(proteina)
    const g = lerNumero(porcaoG)
    if (nome.trim().length < 2) return setErro('Dê um nome ao alimento.')
    if (c === null || p === null) return setErro('Informe os carboidratos e as proteínas por 100 g.')
    if (g === null || g <= 0) return setErro('Informe a porção de referência, em gramas.')

    await executar('Salvando…', async () => {
      aoPronto(
        await api.criarAlimento({
          nome: nome.trim(),
          categoria: categoria.trim() || null,
          carboPor100g: c,
          proteinaPor100g: p,
          porcaoPadraoG: g,
          porcaoDescricao: porcaoDescricao.trim() || null,
          origem,
          codigoBarras: codigo,
        }),
      )
    })
  }

  const mostrarFormulario = modo === 'manual' || preenchido
  const bloqueadoPorIA = !iaDisponivel

  return (
    <section className="cartao novo-alimento" aria-labelledby="titulo-novo-alimento">
      <div className="cartao-topo">
        <h2 id="titulo-novo-alimento">Criar alimento</h2>
        <button type="button" className="botao-texto" onClick={aoCancelar}>
          Cancelar
        </button>
      </div>

      <div className="abas" role="group" aria-label="Como criar">
        <button type="button" aria-pressed={modo === 'manual'} onClick={() => setModo('manual')}>
          Manual
        </button>
        <button type="button" aria-pressed={modo === 'ia'} onClick={() => setModo('ia')}>
          Com IA
        </button>
        <button type="button" aria-pressed={modo === 'codigo'} onClick={() => setModo('codigo')}>
          Código de barras
        </button>
      </div>

      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {aviso && <Aviso tipo="ok">{aviso}</Aviso>}
      {ocupado && (
        <p className="carregando" role="status">
          {ocupado}
        </p>
      )}

      {modo === 'ia' && (
        <div className="formulario">
          {!ia.configurada ? (
            <Aviso tipo="info" titulo="A IA ainda não foi configurada neste servidor">
              Você pode criar o alimento manualmente.
            </Aviso>
          ) : !ia.consentida ? (
            <Aviso tipo="info" titulo="O uso da IA está desativado">
              <Link to="/conta">Ative o consentimento na sua conta</Link> para estimar alimentos com IA.
            </Aviso>
          ) : null}
          <label className="campo">
            <span>Descreva o alimento</span>
            <textarea
              rows={2}
              maxLength={600}
              placeholder="Ex.: pão de queijo congelado assado, ou tapioca com coco"
              value={descricaoIA}
              onChange={(e) => setDescricaoIA(e.target.value)}
            />
          </label>
          <div className="acoes">
            <button
              type="button"
              className="botao"
              disabled={bloqueadoPorIA || !!ocupado || descricaoIA.trim().length < 2 || usosRestantes === 0}
              onClick={() => void estimarPorTexto()}
            >
              Estimar com IA
            </button>
            <label className={`botao botao-secundario${bloqueadoPorIA || !ia.fotoLiberada || usosRestantes === 0 ? ' botao-desativado' : ''}`}>
              <Icone nome="mais" tamanho={18} /> Foto do rótulo
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="so-leitor"
                disabled={bloqueadoPorIA || !ia.fotoLiberada || !!ocupado || usosRestantes === 0}
                onChange={(e) => {
                  void estimarPorFoto(e.target.files?.[0])
                  e.target.value = ''
                }}
              />
            </label>
          </div>
          <p className="texto-apoio">
            {ia.fotoLiberada ? (
              'Com a foto da tabela nutricional, a IA copia os valores do rótulo.'
            ) : (
              <>
                A foto faz parte do plano premium. <Link to="/conta">Conhecer o premium</Link>.
              </>
            )}{' '}
            {iaDisponivel && `${usosRestantes} de ${ia.limiteDiario} usos restantes hoje.`}
          </p>
        </div>
      )}

      {modo === 'codigo' && (
        <div className="formulario">
          <label className="botao botao-secundario botao-largo">
            <Icone nome="mais" tamanho={18} /> Fotografar o código de barras
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="so-leitor"
              disabled={!!ocupado}
              onChange={(e) => {
                void lerFotoDoCodigo(e.target.files?.[0])
                e.target.value = ''
              }}
            />
          </label>
          <form onSubmit={buscarDigitos} className="formulario-linha">
            <label className="campo">
              <span>Ou digite os números</span>
              <input
                inputMode="numeric"
                autoComplete="off"
                placeholder="Ex.: 7891234567895"
                value={digitos}
                onChange={(e) => setDigitos(e.target.value.replace(/\D/g, '').slice(0, 14))}
              />
            </label>
            <button className="botao botao-secundario" disabled={!!ocupado || digitos.length < 8}>
              Buscar
            </button>
          </form>
          <p className="texto-apoio">
            A leitura é feita no seu aparelho. Para achar o produto, só os números do código são consultados no Open
            Food Facts, uma base aberta e colaborativa.
          </p>
        </div>
      )}

      {mostrarFormulario && (
        <form onSubmit={salvar} className="formulario">
          {preenchido && (
            <Aviso tipo="alerta" titulo={origem === 'IA' ? 'Valores estimados pela IA' : 'Confira os valores'}>
              {observacao ?? 'Confira os valores com o rótulo antes de salvar.'} Nada foi salvo ainda.
            </Aviso>
          )}
          <label className="campo">
            <span>Nome</span>
            <input ref={campoNome} required maxLength={80} value={nome} onChange={(e) => setNome(e.target.value)} />
          </label>
          <div className="formulario-linha">
            <label className="campo campo-curto">
              <span>Carboidratos (g por 100 g)</span>
              <input inputMode="decimal" required value={carbo} onChange={(e) => setCarbo(e.target.value)} />
            </label>
            <label className="campo campo-curto">
              <span>Proteínas (g por 100 g)</span>
              <input inputMode="decimal" required value={proteina} onChange={(e) => setProteina(e.target.value)} />
            </label>
          </div>
          <div className="formulario-linha">
            <label className="campo campo-curto">
              <span>Porção (g)</span>
              <input inputMode="decimal" required value={porcaoG} onChange={(e) => setPorcaoG(e.target.value)} />
            </label>
            <label className="campo">
              <span>Medida da porção</span>
              <input
                maxLength={40}
                placeholder="Ex.: 1 fatia"
                value={porcaoDescricao}
                onChange={(e) => setPorcaoDescricao(e.target.value)}
              />
            </label>
          </div>
          <p className="texto-apoio">
            {fmt(lerNumero(porcaoG) ?? 0)} g de porção terão{' '}
            <strong>{fmt(((lerNumero(porcaoG) ?? 0) * (lerNumero(carbo) ?? 0)) / 100)} g</strong> de carboidratos.
            {codigo && ` Código de barras: ${codigo}.`}
          </p>
          <div className="acoes">
            <button className="botao" disabled={!!ocupado}>
              Salvar alimento
            </button>
            {origem !== 'Manual' && <Selo tipo="ia">{origem === 'IA' ? 'Estimado por IA' : 'Código de barras'}</Selo>}
          </div>
        </form>
      )}
    </section>
  )
}
