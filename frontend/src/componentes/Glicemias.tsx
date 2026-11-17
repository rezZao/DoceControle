import { useEffect, useState, type FormEvent } from 'react'
import { api, mensagemDeErro, type Glicemia } from '../api'
import { dataCurta, dataHoraLocal, horaDe, paraApi } from '../util'
import { Aviso, Icone, Selo } from './Base'

const rotuloSituacao: Record<Glicemia['situacao'], string> = {
  NaFaixa: 'Na faixa',
  Abaixo: 'Abaixo da faixa',
  Acima: 'Acima da faixa',
  SemPrescricao: 'Sem faixa cadastrada',
}

export function SeloGlicemia({ glicemia }: { glicemia: Glicemia }) {
  const fora = glicemia.situacao === 'Abaixo' || glicemia.situacao === 'Acima'
  return (
    <Selo tipo={fora ? 'alerta' : glicemia.situacao === 'NaFaixa' ? 'ok' : 'neutro'}>
      {fora && <Icone nome="alerta" tamanho={14} />}
      {rotuloSituacao[glicemia.situacao]}
    </Selo>
  )
}

export function FormularioGlicemia({
  edicao,
  aoGravar,
  aoCancelar,
}: {
  edicao?: Glicemia | null
  aoGravar: () => void
  aoCancelar?: () => void
}) {
  const [valor, setValor] = useState('')
  const [quando, setQuando] = useState(dataHoraLocal())
  const [erro, setErro] = useState<string | null>(null)
  const [gravada, setGravada] = useState<Glicemia | null>(null)
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    setValor(edicao ? String(edicao.valor) : '')
    setQuando(edicao ? edicao.dataHora.slice(0, 16) : dataHoraLocal())
    setErro(null)
  }, [edicao])

  async function enviar(evento: FormEvent) {
    evento.preventDefault()
    const numero = Number(valor)
    if (!Number.isInteger(numero) || numero < 10 || numero > 1000) {
      setErro('Informe a glicemia em mg/dL, só com números (por exemplo, 110).')
      return
    }
    setEnviando(true)
    setErro(null)
    try {
      const resultado = edicao
        ? await api.atualizarGlicemia(edicao.id, numero, paraApi(quando))
        : await api.criarGlicemia(numero, paraApi(quando))
      setGravada(resultado)
      setValor('')
      setQuando(dataHoraLocal())
      aoGravar()
    } catch (e) {
      setErro(mensagemDeErro(e))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {gravada &&
        (gravada.aviso ? (
          <Aviso tipo="alerta" titulo={`${gravada.valor} mg/dL registrado`}>
            {gravada.aviso}
          </Aviso>
        ) : (
          <Aviso tipo="ok">
            {gravada.valor} mg/dL registrado às {horaDe(gravada.dataHora)}.
          </Aviso>
        ))}
      <form onSubmit={enviar} className="formulario-linha">
        <label className="campo campo-curto">
          <span>Glicemia (mg/dL)</span>
          <input
            inputMode="numeric"
            pattern="[0-9]*"
            required
            value={valor}
            onChange={(e) => setValor(e.target.value.replace(/\D/g, '').slice(0, 4))}
          />
        </label>
        <label className="campo">
          <span>Data e hora da medição</span>
          <input type="datetime-local" required value={quando} onChange={(e) => setQuando(e.target.value)} />
        </label>
        <div className="acoes">
          <button className="botao" disabled={enviando}>
            {edicao ? 'Salvar alteração' : 'Registrar glicemia'}
          </button>
          {edicao && aoCancelar && (
            <button type="button" className="botao botao-secundario" onClick={aoCancelar}>
              Cancelar
            </button>
          )}
        </div>
      </form>
    </div>
  )
}

export function ListaGlicemias({
  glicemias,
  comData = false,
  aoEditar,
  aoMudar,
}: {
  glicemias: Glicemia[]
  comData?: boolean
  aoEditar?: (g: Glicemia) => void
  aoMudar: () => void
}) {
  const [erro, setErro] = useState<string | null>(null)

  async function excluir(g: Glicemia) {
    if (!window.confirm(`Excluir a medição de ${g.valor} mg/dL das ${horaDe(g.dataHora)}?`)) return
    try {
      await api.excluirGlicemia(g.id)
      setErro(null)
      aoMudar()
    } catch (e) {
      setErro(mensagemDeErro(e))
    }
  }

  if (glicemias.length === 0) return <p className="texto-apoio">Nenhuma medição registrada.</p>

  return (
    <>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      <ul className="lista-registros">
        {glicemias.map((g) => (
          <li key={g.id}>
            <div className="registro-linha">
              <span className="registro-hora">
                {comData && `${dataCurta(g.dataHora)} · `}
                {horaDe(g.dataHora)}
              </span>
              <strong>{g.valor} mg/dL</strong>
              <SeloGlicemia glicemia={g} />
              <span className="registro-acoes">
                {aoEditar && (
                  <button className="botao-icone" onClick={() => aoEditar(g)} aria-label={`Editar medição de ${g.valor} mg/dL`}>
                    <Icone nome="lapis" />
                  </button>
                )}
                <button className="botao-icone" onClick={() => void excluir(g)} aria-label={`Excluir medição de ${g.valor} mg/dL`}>
                  <Icone nome="lixeira" />
                </button>
              </span>
            </div>
            {g.aviso && <p className="registro-aviso">{g.aviso}</p>}
          </li>
        ))}
      </ul>
    </>
  )
}
