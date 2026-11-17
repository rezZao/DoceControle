import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api, mensagemDeErro } from '../api'
import { Aviso } from '../componentes/Base'
import { useConta } from '../conta'

export function Entrar() {
  const { recarregar, sessaoEncerrada } = useConta()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function enviar(evento: FormEvent) {
    evento.preventDefault()
    setEnviando(true)
    setErro(null)
    try {
      await api.entrar(email, senha)
      await recarregar()
    } catch (e) {
      setErro(mensagemDeErro(e))
      setEnviando(false)
    }
  }

  return (
    <section className="cartao">
      <h1>Entrar</h1>
      <p className="texto-apoio">A dieta do dia, a partir dos limites que o seu médico prescreveu.</p>
      {sessaoEncerrada && !erro && (
        <Aviso tipo="info">A sua sessão foi encerrada por falta de atividade. Entre de novo para continuar.</Aviso>
      )}
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      <form onSubmit={enviar} className="formulario">
        <label className="campo">
          <span>E-mail</span>
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="campo">
          <span>Senha</span>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
          />
        </label>
        <button className="botao botao-largo" disabled={enviando}>
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
      <p>
        Ainda não tem conta? <Link to="/cadastro">Criar conta</Link>
      </p>
    </section>
  )
}

export function Cadastro() {
  const { recarregar } = useConta()
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [consenteSaude, setConsenteSaude] = useState(false)
  const [consenteIA, setConsenteIA] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function enviar(evento: FormEvent) {
    evento.preventDefault()
    if (!consenteSaude) {
      setErro('Para criar a conta é preciso consentir com o tratamento dos seus dados de saúde.')
      return
    }
    setEnviando(true)
    setErro(null)
    try {
      await api.cadastrar({ nome, email, senha, consentimentoDadosSaude: consenteSaude, consentimentoIA: consenteIA })
      await recarregar()
    } catch (e) {
      setErro(mensagemDeErro(e))
      setEnviando(false)
    }
  }

  return (
    <section className="cartao">
      <h1>Criar conta</h1>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      <form onSubmit={enviar} className="formulario">
        <label className="campo">
          <span>Nome</span>
          <input autoComplete="name" required maxLength={80} value={nome} onChange={(e) => setNome(e.target.value)} />
        </label>
        <label className="campo">
          <span>E-mail</span>
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="campo">
          <span>Senha</span>
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            aria-describedby="dica-senha"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
          />
          <small id="dica-senha">Pelo menos 8 caracteres.</small>
        </label>

        <fieldset className="consentimento">
          <legend>Seus dados de saúde</legend>
          <p>
            Para funcionar, o DoceControle guarda dados de saúde que você informar: os limites prescritos pelo seu
            médico, as suas refeições, as suas medições de glicemia e os horários de insulina. Eles são usados só para
            montar a sua dieta, o seu painel, os lembretes e o seu relatório. Não são compartilhados com terceiros nem
            usados para publicidade. Você pode excluir a conta e todos os dados quando quiser.
          </p>
          <label className="marcar">
            <input type="checkbox" checked={consenteSaude} onChange={(e) => setConsenteSaude(e.target.checked)} />
            <span>
              <strong>Concordo com o tratamento dos meus dados de saúde para essas finalidades.</strong> (obrigatório)
            </span>
          </label>
        </fieldset>

        <fieldset className="consentimento">
          <legend>Registro de refeições com inteligência artificial</legend>
          <p>
            Se você quiser, pode descrever a refeição e uma IA identifica os alimentos para você conferir. Para isso, o
            texto da descrição (ou a foto, no plano premium) é enviado a um provedor de IA externo, sem o seu nome nem o
            seu e-mail. A IA também pode estimar um alimento novo e, se você escolher, ler a sua prescrição: nesse caso
            o documento só é enviado depois de você confirmar. Sem este consentimento, o registro manual continua
            disponível.
          </p>
          <label className="marcar">
            <input type="checkbox" checked={consenteIA} onChange={(e) => setConsenteIA(e.target.checked)} />
            <span>Concordo com o envio do conteúdo das minhas refeições à IA. (opcional)</span>
          </label>
        </fieldset>

        <button className="botao botao-largo" disabled={enviando}>
          {enviando ? 'Criando…' : 'Criar conta'}
        </button>
      </form>
      <p>
        Já tem conta? <Link to="/entrar">Entrar</Link>
      </p>
    </section>
  )
}
