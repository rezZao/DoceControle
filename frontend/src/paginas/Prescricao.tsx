import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api, mensagemDeErro, type Lembrete, type PrescricaoLida } from '../api'
import { Aviso, Carregando, Icone, Orientacao, Selo } from '../componentes/Base'
import { useLembretes } from '../componentes/Lembretes'
import { useConta, useContaAtiva } from '../conta'
import { arquivoParaBase64, dataCurta, dataIso, fmt, gramas, lerNumero, prepararFoto, useDados } from '../util'

interface RefeicaoForm {
  chave: number
  nome: string
  horario: string
  limite: string
}

// Só nomes e horários de partida. Os limites nunca têm valor padrão (RI02).
const refeicoesIniciais: Omit<RefeicaoForm, 'chave'>[] = [
  { nome: 'Café da manhã', horario: '07:00', limite: '' },
  { nome: 'Lanche da manhã', horario: '10:00', limite: '' },
  { nome: 'Almoço', horario: '12:30', limite: '' },
  { nome: 'Lanche da tarde', horario: '15:30', limite: '' },
  { nome: 'Jantar', horario: '19:00', limite: '' },
  { nome: 'Ceia', horario: '21:30', limite: '' },
]

let proximaChave = 1
const AVISO =
  'O DoceControle não substitui a orientação do seu médico ou nutricionista e não calcula nem sugere doses de insulina.'

const MAX_PDF = 4 * 1024 * 1024

/**
 * Leitura da prescrição por IA (foto ou PDF). A IA só TRANSCREVE o que está escrito: não define limites nem
 * calcula doses (RI01, RI10). O resultado preenche o formulário abaixo; nada é salvo até o usuário conferir e
 * confirmar que os valores foram prescritos por um profissional (RN01). O documento não é guardado.
 */
function LeituraPorIA({ aoLer }: { aoLer: (leitura: PrescricaoLida) => void }) {
  const conta = useContaAtiva()
  const { recarregar } = useConta()
  const [confirma, setConfirma] = useState(false)
  const [lendo, setLendo] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [resumo, setResumo] = useState<PrescricaoLida | null>(null)

  const ia = conta.ia
  const usosRestantes = Math.max(0, ia.limiteDiario - ia.usosHoje)

  async function ler(arquivo: File | undefined) {
    if (!arquivo) return
    const pdf = arquivo.type === 'application/pdf'
    if (pdf && arquivo.size > MAX_PDF) return setErro('O PDF é grande demais (o limite é de 4 MB). Envie uma foto da prescrição.')

    setLendo(true)
    setErro(null)
    try {
      const base64 = pdf ? await arquivoParaBase64(arquivo) : await prepararFoto(arquivo, 2000)
      const r = await api.lerPrescricao(base64)
      setResumo(r.leitura)
      aoLer(r.leitura)
      void recarregar()
    } catch (e) {
      setErro(mensagemDeErro(e))
    } finally {
      setLendo(false)
    }
  }

  const campos: [string, boolean][] = resumo
    ? [
        ['limite de carboidratos', resumo.limiteCarboDia !== null],
        ['faixa de glicemia', resumo.glicemiaMin !== null],
        ['meta de proteínas', resumo.metaProteinaDia !== null],
        ['tempo máximo sem comer', resumo.jejumMaxMin !== null],
        ['refeições', resumo.refeicoes.length > 0],
      ]
    : []

  return (
    <section className="cartao" aria-labelledby="titulo-leitura">
      <h2 id="titulo-leitura">Ler a prescrição com IA</h2>
      <p className="texto-apoio">
        Tire uma foto ou envie o PDF da prescrição e a IA copia os valores para o formulário abaixo. Ela só transcreve o
        que está escrito: não define limites nem calcula doses. Você confere tudo antes de salvar.
      </p>

      {!ia.configurada ? (
        <Aviso tipo="info" titulo="A IA ainda não foi configurada neste servidor">
          Preencha a prescrição manualmente.
        </Aviso>
      ) : !ia.consentida ? (
        <Aviso tipo="info" titulo="O uso da IA está desativado">
          <Link to="/conta">Ative o consentimento na sua conta</Link> para ler a prescrição com IA.
        </Aviso>
      ) : (
        <>
          <label className="marcar">
            <input type="checkbox" checked={confirma} onChange={(e) => setConfirma(e.target.checked)} />
            <span>
              Concordo em enviar este documento a um provedor de IA externo. Ele pode ter dados pessoais (como o seu
              nome e o do médico); não é guardado.
            </span>
          </label>
          <label className={`botao botao-secundario${!confirma || lendo || usosRestantes === 0 ? ' botao-desativado' : ''}`}>
            {lendo ? 'Lendo…' : 'Escolher foto ou PDF'}
            <input
              type="file"
              accept="image/*,application/pdf"
              className="so-leitor"
              disabled={!confirma || lendo || usosRestantes === 0}
              onChange={(e) => {
                void ler(e.target.files?.[0])
                e.target.value = ''
              }}
            />
          </label>
          <p className="texto-apoio">{usosRestantes} de {ia.limiteDiario} usos restantes hoje.</p>
        </>
      )}

      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {resumo && (
        <Aviso tipo="alerta" titulo="Confira o que a IA leu. Nada foi salvo ainda.">
          {campos.some(([, achou]) => achou) ? (
            <>Preenchi o formulário com: {campos.filter(([, achou]) => achou).map(([nome]) => nome).join(', ')}. </>
          ) : (
            <>Não consegui ler valores neste documento. </>
          )}
          {campos.some(([, achou]) => !achou) && (
            <>Não encontrei: {campos.filter(([, achou]) => !achou).map(([nome]) => nome).join(', ')}. </>
          )}
          {resumo.observacao}
        </Aviso>
      )}
    </section>
  )
}

// RF03 / RF12: registrar e atualizar a prescrição médica.
function FormularioPrescricao({ leitura }: { leitura: PrescricaoLida | null }) {
  const { recarregar: recarregarConta } = useConta()
  const { dados: atual, erro: erroCarga, carregando, recarregar } = useDados(() => api.prescricao(), [])
  const [limite, setLimite] = useState('')
  const [glicemiaMin, setGlicemiaMin] = useState('')
  const [glicemiaMax, setGlicemiaMax] = useState('')
  const [proteina, setProteina] = useState('')
  const [jejum, setJejum] = useState('')
  const [personalizada, setPersonalizada] = useState(false)
  const [refeicoes, setRefeicoes] = useState<RefeicaoForm[]>(() =>
    refeicoesIniciais.map((r) => ({ ...r, chave: proximaChave++ })),
  )
  const [confirma, setConfirma] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [salvo, setSalvo] = useState(false)
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    if (!atual) return
    setLimite(String(atual.limiteCarboDia))
    setGlicemiaMin(String(atual.glicemiaMin))
    setGlicemiaMax(String(atual.glicemiaMax))
    setProteina(atual.metaProteinaDia === null ? '' : String(atual.metaProteinaDia))
    setJejum(atual.jejumMaxMin === null ? '' : String(Math.round((atual.jejumMaxMin / 60) * 100) / 100))
    setPersonalizada(atual.divisaoPersonalizada)
    setRefeicoes(
      atual.refeicoes.map((r) => ({
        chave: proximaChave++,
        nome: r.nome,
        horario: r.horario,
        limite: String(r.limiteCarbo),
      })),
    )
  }, [atual])

  // Valores lidos da prescrição pela IA: só preenchem o formulário. O que não foi encontrado fica como estava.
  useEffect(() => {
    if (!leitura) return
    if (leitura.limiteCarboDia !== null) setLimite(String(leitura.limiteCarboDia))
    if (leitura.glicemiaMin !== null && leitura.glicemiaMax !== null) {
      setGlicemiaMin(String(leitura.glicemiaMin))
      setGlicemiaMax(String(leitura.glicemiaMax))
    }
    if (leitura.metaProteinaDia !== null) setProteina(String(leitura.metaProteinaDia))
    if (leitura.jejumMaxMin !== null) setJejum(String(Math.round((leitura.jejumMaxMin / 60) * 100) / 100))
    if (leitura.refeicoes.length > 0) {
      setPersonalizada(leitura.refeicoes.every((r) => r.limiteCarbo !== null))
      setRefeicoes(
        leitura.refeicoes.map((r) => ({
          chave: proximaChave++,
          nome: r.nome,
          // Horário que a IA não achou fica em branco: o formulário exige que o usuário preencha.
          horario: r.horario ?? '',
          limite: r.limiteCarbo === null ? '' : String(r.limiteCarbo),
        })),
      )
    }
    setConfirma(false)
    setSalvo(false)
  }, [leitura])

  if (erroCarga) return <Aviso tipo="erro">{erroCarga}</Aviso>
  if (carregando && atual === undefined) return <Carregando />

  const limiteNumero = lerNumero(limite)
  // RN03: por padrão, partes iguais. A parte é truncada para a soma nunca passar do limite.
  const parteIgual =
    limiteNumero && refeicoes.length > 0 ? Math.floor((limiteNumero / refeicoes.length) * 10 + 1e-9) / 10 : null
  const soma = refeicoes.reduce((s, r) => s + (lerNumero(r.limite) ?? 0), 0)
  const somaPassa = personalizada && limiteNumero !== null && soma > limiteNumero + 1e-9

  const mudar = (chave: number, mudanca: Partial<RefeicaoForm>) =>
    setRefeicoes((lista) => lista.map((r) => (r.chave === chave ? { ...r, ...mudanca } : r)))

  async function enviar(evento: FormEvent) {
    evento.preventDefault()
    setSalvo(false)
    const min = lerNumero(glicemiaMin)
    const max = lerNumero(glicemiaMax)
    if (limiteNumero === null || min === null || max === null)
      return setErro('Preencha o limite de carboidratos e a faixa de glicemia.')
    if (somaPassa) return setErro('A soma das refeições ultrapassa o limite diário de carboidratos.')
    const horasJejum = lerNumero(jejum)
    if (jejum.trim() && (horasJejum === null || horasJejum < 0.5 || horasJejum > 12))
      return setErro('O tempo máximo sem comer deve ficar entre 30 minutos e 12 horas.')
    // RN01: os valores só são cadastrados com a confirmação de que foram prescritos.
    if (!confirma) return setErro('Confirme que estes valores foram prescritos por um profissional de saúde.')

    setEnviando(true)
    setErro(null)
    try {
      await api.salvarPrescricao({
        limiteCarboDia: limiteNumero,
        glicemiaMin: min,
        glicemiaMax: max,
        metaProteinaDia: lerNumero(proteina),
        jejumMaxMin: jejum.trim() && horasJejum !== null ? Math.round(horasJejum * 60) : null,
        divisaoPersonalizada: personalizada,
        refeicoes: refeicoes.map((r) => ({
          nome: r.nome,
          horario: r.horario,
          limiteCarbo: personalizada ? lerNumero(r.limite) : null,
        })),
        confirmaPrescricaoProfissional: confirma,
        hoje: dataIso(),
      })
      setSalvo(true)
      setConfirma(false)
      await Promise.all([recarregar(), recarregarConta()])
    } catch (e) {
      setErro(mensagemDeErro(e))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={enviar}>
      <section className="cartao">
        <h2>Limites prescritos</h2>
        {atual ? (
          <p className="texto-apoio">
            Prescrição em vigor desde {dataCurta(atual.vigenteDesde)}. Ao salvar uma alteração, a dieta é gerada de novo
            a partir de hoje; os dias anteriores continuam comparados com os limites da época.
          </p>
        ) : (
          <p className="texto-apoio">Informe os valores exatamente como o seu médico prescreveu.</p>
        )}
        <div className="formulario-linha">
          <label className="campo">
            <span>Limite diário de carboidratos (g)</span>
            <input inputMode="decimal" required value={limite} onChange={(e) => setLimite(e.target.value)} />
          </label>
          <label className="campo">
            <span>Meta diária de proteínas (g), se houver</span>
            <input inputMode="decimal" value={proteina} onChange={(e) => setProteina(e.target.value)} aria-describedby="dica-proteina" />
            <small id="dica-proteina">Opcional. Só preencha se o médico ou o nutricionista orientou.</small>
          </label>
        </div>
        <div className="formulario-linha">
          <label className="campo">
            <span>Glicemia mínima (mg/dL)</span>
            <input inputMode="numeric" required value={glicemiaMin} onChange={(e) => setGlicemiaMin(e.target.value)} />
          </label>
          <label className="campo">
            <span>Glicemia máxima (mg/dL)</span>
            <input inputMode="numeric" required value={glicemiaMax} onChange={(e) => setGlicemiaMax(e.target.value)} />
          </label>
        </div>
        <label className="campo">
          <span>Tempo máximo sem comer (horas), se houver</span>
          <input inputMode="decimal" value={jejum} onChange={(e) => setJejum(e.target.value)} aria-describedby="dica-jejum" />
          <small id="dica-jejum">
            Opcional. Só preencha se o médico orientou. Ao passar desse tempo sem registrar uma refeição, o site avisa.
          </small>
        </label>
      </section>

      <section className="cartao" aria-labelledby="titulo-refeicoes-form">
        <h2 id="titulo-refeicoes-form">Refeições do dia</h2>
        <ul className="lista-itens">
          {refeicoes.map((r, i) => (
            <li key={r.chave}>
              <div className="formulario-linha linha-refeicao">
                <label className="campo">
                  <span>Refeição {i + 1}</span>
                  <input required maxLength={40} value={r.nome} onChange={(e) => mudar(r.chave, { nome: e.target.value })} />
                </label>
                <label className="campo campo-curto">
                  <span>Horário</span>
                  <input type="time" required value={r.horario} onChange={(e) => mudar(r.chave, { horario: e.target.value })} />
                </label>
                {personalizada ? (
                  <label className="campo campo-curto">
                    <span>Carboidratos (g)</span>
                    <input inputMode="decimal" required value={r.limite} onChange={(e) => mudar(r.chave, { limite: e.target.value })} />
                  </label>
                ) : (
                  <p className="parte-igual">{parteIgual === null ? '—' : gramas(parteIgual)}</p>
                )}
                <button
                  type="button"
                  className="botao-icone"
                  disabled={refeicoes.length === 1}
                  onClick={() => setRefeicoes((l) => l.filter((x) => x.chave !== r.chave))}
                  aria-label={`Remover ${r.nome || `refeição ${i + 1}`}`}
                >
                  <Icone nome="lixeira" />
                </button>
              </div>
            </li>
          ))}
        </ul>
        <div className="acoes">
          <button
            type="button"
            className="botao botao-secundario botao-pequeno"
            disabled={refeicoes.length >= 10}
            onClick={() => setRefeicoes((l) => [...l, { chave: proximaChave++, nome: '', horario: '12:00', limite: '' }])}
          >
            <Icone nome="mais" tamanho={18} /> Adicionar refeição
          </button>
        </div>

        <label className="marcar">
          <input type="checkbox" checked={personalizada} onChange={(e) => setPersonalizada(e.target.checked)} />
          <span>
            Ajustar os carboidratos de cada refeição, conforme a orientação do nutricionista. Sem isso, o limite diário
            é dividido em partes iguais.
          </span>
        </label>
        {personalizada && limiteNumero !== null && (
          <p className={somaPassa ? 'texto-erro' : 'texto-apoio'} role="status">
            {somaPassa && <Icone nome="alerta" tamanho={18} />} Soma das refeições: {fmt(soma)} g de {fmt(limiteNumero)} g.
            {somaPassa && ' A soma não pode passar do limite diário.'}
          </p>
        )}
      </section>

      <section className="cartao">
        <label className="marcar marcar-destaque">
          <input type="checkbox" checked={confirma} onChange={(e) => setConfirma(e.target.checked)} />
          <span>
            <strong>Confirmo que estes valores foram prescritos por um profissional de saúde.</strong>
          </span>
        </label>
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        {salvo && (
          <Aviso tipo="ok">
            Prescrição salva. <Link to="/dieta">Ver a dieta do dia</Link>
          </Aviso>
        )}
        <button className="botao botao-largo" disabled={enviando}>
          {enviando ? 'Salvando…' : atual ? 'Salvar alteração' : 'Salvar prescrição'}
        </button>
        <Orientacao texto={AVISO} />
      </section>
    </form>
  )
}

// RF10: horários (e, se o usuário quiser, a dose prescrita) para os lembretes de insulina.
// Opcionais: o site funciona sem eles (RN12, RI07).
function LembretesDeInsulina({
  sugeridos,
  aoUsar,
}: {
  sugeridos: PrescricaoLida['lembretes']
  aoUsar: (indice: number) => void
}) {
  const { lembretes, recarregar } = useLembretes()
  const [edicao, setEdicao] = useState<Lembrete | null>(null)
  const [horario, setHorario] = useState('08:00')
  const [descricao, setDescricao] = useState('')
  const [dose, setDose] = useState('')
  const [repeticao, setRepeticao] = useState('5')
  const [erro, setErro] = useState<string | null>(null)

  function preencher(l: Lembrete | null) {
    setEdicao(l)
    setHorario(l?.horario ?? '08:00')
    setDescricao(l?.descricao ?? '')
    setDose(l?.doseInformada == null ? '' : String(l.doseInformada))
    setRepeticao(String(l?.repeticaoMin ?? 5))
    setErro(null)
  }

  async function executar(acao: () => Promise<unknown>) {
    try {
      await acao()
      setErro(null)
      await recarregar()
      return true
    } catch (e) {
      setErro(mensagemDeErro(e))
      return false
    }
  }

  async function enviar(evento: FormEvent) {
    evento.preventDefault()
    const dados = {
      horario,
      descricao: descricao.trim() || null,
      doseInformada: lerNumero(dose),
      repeticaoMin: lerNumero(repeticao) ?? 5,
      ativo: edicao?.ativo ?? true,
    }
    const ok = await executar(() => (edicao ? api.atualizarLembrete(edicao.id, dados) : api.criarLembrete(dados)))
    if (ok) preencher(null)
  }

  const alternar = (l: Lembrete) =>
    executar(() =>
      api.atualizarLembrete(l.id, {
        horario: l.horario,
        descricao: l.descricao,
        doseInformada: l.doseInformada,
        repeticaoMin: l.repeticaoMin,
        ativo: !l.ativo,
      }),
    )

  return (
    <section className="cartao" aria-labelledby="titulo-lembretes-form">
      <h2 id="titulo-lembretes-form">
        <Icone nome="sino" /> Lembretes de insulina <Selo tipo="neutro">opcional</Selo>
      </h2>
      <p className="texto-apoio">
        Se você usa insulina, cadastre os horários de aplicação para receber um aviso sonoro e visual. A dose é só um
        lembrete do que o seu médico prescreveu: o DoceControle nunca calcula nem sugere dose. Os avisos tocam com o
        site aberto e, se o navegador permitir, também por notificação.
      </p>

      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      {sugeridos.length > 0 && (
        <Aviso tipo="info" titulo="Lembretes encontrados na prescrição">
          <ul className="lista-simples">
            {sugeridos.map((l, i) => (
              <li key={`${l.horario}-${i}`} className="registro-linha">
                <strong className="registro-hora">{l.horario}</strong>
                <span className="registro-texto">
                  {l.descricao ?? 'Insulina'}
                  {l.doseInformada !== null && ` · dose escrita: ${fmt(l.doseInformada)} unidades`}
                </span>
                <button
                  type="button"
                  className="botao botao-pequeno"
                  onClick={async () => {
                    const ok = await executar(() =>
                      api.criarLembrete({
                        horario: l.horario,
                        descricao: l.descricao,
                        doseInformada: l.doseInformada,
                        repeticaoMin: 5,
                        ativo: true,
                      }),
                    )
                    if (ok) aoUsar(i)
                  }}
                >
                  Adicionar
                </button>
              </li>
            ))}
          </ul>
          <p className="texto-apoio">Confira o horário e a dose com o documento antes de adicionar.</p>
        </Aviso>
      )}

      {lembretes.length > 0 && (
        <ul className="lista-registros">
          {lembretes.map((l) => (
            <li key={l.id}>
              <div className="registro-linha">
                <strong className="registro-hora">{l.horario}</strong>
                <span className="registro-texto">
                  {l.descricao ?? 'Insulina'}
                  {l.doseInformada !== null && ` · dose informada: ${fmt(l.doseInformada)} unidades`} · repete a cada{' '}
                  {l.repeticaoMin} min
                </span>
                {!l.ativo && <Selo tipo="neutro">Desativado</Selo>}
                <span className="registro-acoes">
                  <button className="botao-texto" onClick={() => void alternar(l)}>
                    {l.ativo ? 'Desativar' : 'Ativar'}
                  </button>
                  <button className="botao-icone" onClick={() => preencher(l)} aria-label={`Editar lembrete das ${l.horario}`}>
                    <Icone nome="lapis" />
                  </button>
                  <button
                    className="botao-icone"
                    onClick={() => {
                      if (window.confirm(`Excluir o lembrete das ${l.horario}?`)) void executar(() => api.excluirLembrete(l.id))
                    }}
                    aria-label={`Excluir lembrete das ${l.horario}`}
                  >
                    <Icone nome="lixeira" />
                  </button>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={enviar} className="formulario">
        <h3>{edicao ? `Alterar o lembrete das ${edicao.horario}` : 'Novo lembrete'}</h3>
        <div className="formulario-linha">
          <label className="campo campo-curto">
            <span>Horário</span>
            <input type="time" required value={horario} onChange={(e) => setHorario(e.target.value)} />
          </label>
          <label className="campo">
            <span>Descrição (opcional)</span>
            <input maxLength={60} placeholder="Ex.: Insulina rápida" value={descricao} onChange={(e) => setDescricao(e.target.value)} />
          </label>
        </div>
        <div className="formulario-linha">
          <label className="campo">
            <span>Dose prescrita, em unidades (opcional)</span>
            <input inputMode="decimal" value={dose} onChange={(e) => setDose(e.target.value)} />
          </label>
          <label className="campo campo-curto">
            <span>Repetir a cada (min)</span>
            <input inputMode="numeric" required value={repeticao} onChange={(e) => setRepeticao(e.target.value)} />
          </label>
        </div>
        <div className="acoes">
          <button className="botao">{edicao ? 'Salvar lembrete' : 'Adicionar lembrete'}</button>
          {edicao && (
            <button type="button" className="botao botao-secundario" onClick={() => preencher(null)}>
              Cancelar
            </button>
          )}
        </div>
      </form>
    </section>
  )
}

export function PrescricaoPagina() {
  const [leitura, setLeitura] = useState<PrescricaoLida | null>(null)
  const [sugeridos, setSugeridos] = useState<PrescricaoLida['lembretes']>([])

  return (
    <>
      <h1>Prescrição</h1>
      <LeituraPorIA
        aoLer={(l) => {
          setLeitura(l)
          setSugeridos(l.lembretes)
        }}
      />
      <FormularioPrescricao leitura={leitura} />
      <LembretesDeInsulina sugeridos={sugeridos} aoUsar={(i) => setSugeridos((l) => l.filter((_, k) => k !== i))} />
    </>
  )
}
