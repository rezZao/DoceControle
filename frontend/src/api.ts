// Cliente da API em C#. Os tipos espelham o arquivo Contratos.cs do backend.

export type Plano = 'Gratuito' | 'Premium'
export type SituacaoGlicemia = 'SemPrescricao' | 'NaFaixa' | 'Abaixo' | 'Acima'
export type EntradaIA = 'Texto' | 'Foto'

export interface IaEstado {
  /** Falso quando o servidor não tem um provedor de IA configurado: a IA fica desativada. */
  configurada: boolean
  consentida: boolean
  limiteDiario: number
  usosHoje: number
  /** Plano premium: libera o registro por foto. */
  fotoLiberada: boolean
}

export interface Conta {
  nome: string
  email: string
  plano: Plano
  consentimentoEm: string
  temPrescricao: boolean
  ia: IaEstado
  pagamentoSimulado: boolean
  minutosSessao: number
}

export interface Meta {
  nome: string
  horario: string
  limiteCarbo: number
  metaProteina: number | null
}

export interface Prescricao {
  id: number
  vigenteDesde: string
  limiteCarboDia: number
  glicemiaMin: number
  glicemiaMax: number
  metaProteinaDia: number | null
  /** Tempo máximo, em minutos, que o médico orientou ficar sem comer. */
  jejumMaxMin: number | null
  divisaoPersonalizada: boolean
  refeicoes: Meta[]
}

export interface PrescricaoEnvio {
  limiteCarboDia: number
  glicemiaMin: number
  glicemiaMax: number
  metaProteinaDia: number | null
  jejumMaxMin: number | null
  divisaoPersonalizada: boolean
  refeicoes: { nome: string; horario: string; limiteCarbo: number | null }[]
  confirmaPrescricaoProfissional: boolean
  hoje: string
}

export interface Lembrete {
  id: number
  horario: string
  doseInformada: number | null
  descricao: string | null
  repeticaoMin: number
  ativo: boolean
  confirmadoHoje: boolean
}

export interface LembreteEnvio {
  horario: string
  doseInformada: number | null
  descricao: string | null
  repeticaoMin: number
  ativo: boolean
}

export type OrigemAlimento = 'Base' | 'Manual' | 'IA' | 'CodigoBarras'

export interface Alimento {
  id: number
  nome: string
  categoria: string
  carboPor100g: number
  proteinaPor100g: number
  porcaoPadraoG: number
  porcaoDescricao: string
  origem: OrigemAlimento
  codigoBarras: string | null
  /** Criado pelo próprio usuário. */
  proprio: boolean
}

export interface NovoAlimento {
  nome: string
  categoria: string | null
  carboPor100g: number
  proteinaPor100g: number
  porcaoPadraoG: number
  porcaoDescricao: string | null
  origem: Exclude<OrigemAlimento, 'Base'>
  codigoBarras: string | null
}

/** Dados para preencher o formulário de um alimento novo (IA ou código de barras). Nada foi gravado. */
export interface PropostaAlimento {
  nome: string
  categoria: string
  carboPor100g: number | null
  proteinaPor100g: number | null
  porcaoPadraoG: number
  porcaoDescricao: string
  origem: OrigemAlimento
  codigoBarras: string | null
  observacao: string | null
}

export interface ResultadoCodigoBarras {
  existente: Alimento | null
  proposta: PropostaAlimento | null
}

export interface PrescricaoLida {
  limiteCarboDia: number | null
  glicemiaMin: number | null
  glicemiaMax: number | null
  metaProteinaDia: number | null
  jejumMaxMin: number | null
  refeicoes: { nome: string; horario: string | null; limiteCarbo: number | null }[]
  lembretes: { horario: string; descricao: string | null; doseInformada: number | null }[]
  observacao: string | null
}

export type EstadoJejum = 'SemLimite' | 'Aguardando' | 'Contando' | 'Excedido' | 'Encerrado'

export interface Jejum {
  estado: EstadoJejum
  minutos: number
  limiteMin: number | null
  restanteMin: number
  aviso: string | null
}

export interface ItemRegistro {
  alimentoId: number
  nome: string
  quantidadeG: number
  carbo: number
  proteina: number
  daIA: boolean
}

export interface RegistroRefeicao {
  id: number
  dataHora: string
  refeicao: string
  totalCarbo: number
  totalProteina: number
  itens: ItemRegistro[]
}

export interface RefeicaoEnvio {
  dataHora: string
  refeicao: string
  itens: { alimentoId: number; quantidadeG: number; daSugestao: boolean }[]
  sugestaoId: number | null
}

export interface RefeicaoGravada {
  registro: RegistroRefeicao
  avisos: string[]
}

export interface Glicemia {
  id: number
  valor: number
  dataHora: string
  situacao: SituacaoGlicemia
  aviso: string | null
}

export interface PorcaoExemplo {
  alimentoId: number
  nome: string
  porcao: string
  porcaoG: number
  carbo: number
  proteina: number
}

export interface RefeicaoDoDia {
  nome: string
  horario: string
  limiteCarbo: number
  metaProteina: number | null
  carboConsumido: number
  proteinaConsumida: number
  carboRestante: number
  limiteUltrapassado: boolean
  registros: RegistroRefeicao[]
  exemplos: PorcaoExemplo[]
}

export interface Dia {
  data: string
  prescricao: Prescricao | null
  carboConsumido: number
  carboLimite: number | null
  carboRestante: number | null
  limiteUltrapassado: boolean
  proteinaConsumida: number
  proteinaMeta: number | null
  refeicoes: RefeicaoDoDia[]
  outrosRegistros: RegistroRefeicao[]
  glicemias: Glicemia[]
  avisoOrientacao: string
}

export interface DiaHistorico {
  data: string
  carboConsumido: number
  carboLimite: number | null
  limiteUltrapassado: boolean
  proteinaConsumida: number
  proteinaMeta: number | null
  refeicoes: number
  medicoes: number
  glicemiaMin: number | null
  glicemiaMax: number | null
  glicemiaMedia: number | null
  medicoesForaDaFaixa: number
  faixaMin: number | null
  faixaMax: number | null
}

export interface Relatorio {
  nome: string
  de: string
  ate: string
  prescricaoVigente: Prescricao | null
  dias: DiaHistorico[]
  glicemias: Glicemia[]
  lembretes: {
    horario: string
    doseInformada: number | null
    descricao: string | null
    diasConfirmados: number
    diasNoPeriodo: number
  }[]
  avisoOrientacao: string
}

export interface ItemSugerido {
  descricao: string
  quantidadeG: number
  alimento: Alimento | null
  carbo: number | null
  proteina: number | null
}

export interface Sugestao {
  id: number
  entrada: EntradaIA
  itens: ItemSugerido[]
  usosRestantes: number
}

export class ErroApi extends Error {
  status: number
  codigo?: string

  constructor(mensagem: string, status: number, codigo?: string) {
    super(mensagem)
    this.status = status
    this.codigo = codigo
  }
}

/** Mensagem pronta para mostrar ao usuário a partir de qualquer erro. */
export function mensagemDeErro(erro: unknown): string {
  if (erro instanceof ErroApi) return erro.message
  return 'Não foi possível falar com o servidor. Confira a sua conexão e tente de novo.'
}

async function chamar<T>(metodo: string, caminho: string, corpo?: unknown): Promise<T> {
  const resposta = await fetch('/api' + caminho, {
    method: metodo,
    headers: corpo === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
    credentials: 'same-origin',
  })

  if (resposta.status === 401 && !caminho.startsWith('/conta/entrar')) {
    window.dispatchEvent(new Event('sessao-encerrada'))
  }

  const texto = await resposta.text()
  let dados: unknown
  try {
    dados = texto ? JSON.parse(texto) : undefined
  } catch {
    dados = undefined
  }

  if (!resposta.ok) {
    const erro = dados as { mensagem?: string; codigo?: string } | undefined
    const padrao =
      resposta.status === 429
        ? 'Muitas tentativas. Aguarde um minuto e tente de novo.'
        : 'Não foi possível concluir. Tente de novo.'
    throw new ErroApi(erro?.mensagem ?? padrao, resposta.status, erro?.codigo)
  }
  return dados as T
}

const q = (parametros: Record<string, string | number | undefined>) => {
  const pares = Object.entries(parametros).filter(([, v]) => v !== undefined && v !== '')
  return pares.length ? '?' + pares.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&') : ''
}

export const api = {
  conta: () => chamar<Conta>('GET', '/conta'),
  cadastrar: (dados: {
    nome: string
    email: string
    senha: string
    consentimentoDadosSaude: boolean
    consentimentoIA: boolean
  }) => chamar<void>('POST', '/conta/cadastro', dados),
  entrar: (email: string, senha: string) => chamar<void>('POST', '/conta/entrar', { email, senha }),
  sair: () => chamar<void>('POST', '/conta/sair'),
  consentirIA: (consentir: boolean) => chamar<void>('PUT', '/conta/consentimento-ia', { consentir }),
  excluirConta: (senha: string) => chamar<void>('POST', '/conta/excluir', { senha }),
  assinar: () => chamar<void>('POST', '/assinatura/assinar'),
  cancelarAssinatura: () => chamar<void>('POST', '/assinatura/cancelar'),

  prescricao: () => chamar<Prescricao | null>('GET', '/prescricao'),
  salvarPrescricao: (dados: PrescricaoEnvio) => chamar<Prescricao>('PUT', '/prescricao', dados),

  lembretes: (data: string) => chamar<Lembrete[]>('GET', '/lembretes' + q({ data })),
  criarLembrete: (dados: LembreteEnvio) => chamar<Lembrete>('POST', '/lembretes', dados),
  atualizarLembrete: (id: number, dados: LembreteEnvio) => chamar<Lembrete>('PUT', `/lembretes/${id}`, dados),
  excluirLembrete: (id: number) => chamar<void>('DELETE', `/lembretes/${id}`),
  confirmarLembrete: (id: number, data: string) => chamar<void>('POST', `/lembretes/${id}/confirmar`, { data }),

  alimentos: (busca: string, limite = 12) => chamar<Alimento[]>('GET', '/alimentos' + q({ busca, limite })),
  criarAlimento: (dados: NovoAlimento) => chamar<Alimento>('POST', '/alimentos', dados),
  excluirAlimento: (id: number) => chamar<void>('DELETE', `/alimentos/${id}`),
  buscarCodigo: (codigo: string) =>
    chamar<ResultadoCodigoBarras>('GET', `/alimentos/codigo/${encodeURIComponent(codigo)}`),
  jejum: (agora: string) => chamar<Jejum>('GET', '/jejum' + q({ agora })),

  dia: (data: string) => chamar<Dia>('GET', '/dia' + q({ data })),
  historico: (ate: string, dias: number) => chamar<DiaHistorico[]>('GET', '/historico' + q({ ate, dias })),
  relatorio: (ate: string, dias: number) => chamar<Relatorio>('GET', '/relatorio' + q({ ate, dias })),

  refeicao: (id: number) => chamar<RegistroRefeicao>('GET', `/refeicoes/${id}`),
  criarRefeicao: (dados: RefeicaoEnvio) => chamar<RefeicaoGravada>('POST', '/refeicoes', dados),
  atualizarRefeicao: (id: number, dados: RefeicaoEnvio) => chamar<RefeicaoGravada>('PUT', `/refeicoes/${id}`, dados),
  excluirRefeicao: (id: number) => chamar<void>('DELETE', `/refeicoes/${id}`),

  criarGlicemia: (valor: number, dataHora: string) => chamar<Glicemia>('POST', '/glicemias', { valor, dataHora }),
  atualizarGlicemia: (id: number, valor: number, dataHora: string) =>
    chamar<Glicemia>('PUT', `/glicemias/${id}`, { valor, dataHora }),
  excluirGlicemia: (id: number) => chamar<void>('DELETE', `/glicemias/${id}`),

  sugerirPorTexto: (descricao: string) => chamar<Sugestao>('POST', '/ia/sugestoes/texto', { descricao }),
  sugerirPorFoto: (imagemBase64: string) => chamar<Sugestao>('POST', '/ia/sugestoes/foto', { imagemBase64 }),
  descartarSugestao: (id: number) => chamar<void>('DELETE', `/ia/sugestoes/${id}`),
  estimarAlimentoPorTexto: (descricao: string) =>
    chamar<{ proposta: PropostaAlimento; usosRestantes: number }>('POST', '/ia/alimentos/texto', { descricao }),
  estimarAlimentoPorFoto: (imagemBase64: string, descricao: string | null) =>
    chamar<{ proposta: PropostaAlimento; usosRestantes: number }>('POST', '/ia/alimentos/foto', { imagemBase64, descricao }),
  lerPrescricao: (arquivoBase64: string) =>
    chamar<{ leitura: PrescricaoLida; usosRestantes: number }>('POST', '/ia/prescricao', {
      arquivoBase64,
      confirmaEnvio: true,
    }),
}
