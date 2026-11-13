import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api, mensagemDeErro } from '../api'
import { Aviso, Icone, Selo } from '../componentes/Base'
import { useConta, useContaAtiva } from '../conta'

export function ContaPagina() {
  const conta = useContaAtiva()
  const { recarregar } = useConta()
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [senha, setSenha] = useState('')
  const [erroExclusao, setErroExclusao] = useState<string | null>(null)
  const premium = conta.plano === 'Premium'

  async function executar(acao: () => Promise<unknown>) {
    setOcupado(true)
    setErro(null)
    try {
      await acao()
      await recarregar()
    } catch (e) {
      setErro(mensagemDeErro(e))
    } finally {
      setOcupado(false)
    }
  }

  // RF14: excluir a conta e os dados a pedido do usuário.
  async function excluir(evento: FormEvent) {
    evento.preventDefault()
    if (!window.confirm('Excluir a conta apaga todos os seus dados e não pode ser desfeito. Continuar?')) return
    try {
      await api.excluirConta(senha)
      await recarregar()
    } catch (e) {
      setErroExclusao(mensagemDeErro(e))
    }
  }

  return (
    <>
      <h1>Conta</h1>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      <section className="cartao">
        <h2>{conta.nome}</h2>
        <p>{conta.email}</p>
        <p className="texto-apoio">
          A sessão é encerrada após {conta.minutosSessao} minutos sem atividade. Com o site aberto, ela continua ativa
          para os lembretes tocarem.
        </p>
        <p>
          <Link className="botao botao-secundario" to="/relatorio">
            Relatório para a consulta
          </Link>
        </p>
      </section>

      {/* RF19 / RF20: assinatura premium. Só o registro por foto é pago (RN24). */}
      <section className="cartao" aria-labelledby="titulo-plano">
        <h2 id="titulo-plano">
          Plano {premium ? <Selo tipo="premium"><Icone nome="estrela" tamanho={14} /> Premium</Selo> : <Selo tipo="neutro">Gratuito</Selo>}
        </h2>
        <ul>
          <li>
            <strong>Sempre gratuitos:</strong> dieta do dia, registro manual, glicemia, lembretes, histórico e
            relatório.
          </li>
          <li>
            <strong>Gratuito com limite diário:</strong> registro por descrição com IA ({conta.ia.limiteDiario} usos por
            dia no seu plano).
          </li>
          <li>
            <strong>Premium:</strong> registro por foto com IA.
          </li>
        </ul>
        {conta.pagamentoSimulado && (
          <Aviso tipo="info">
            Versão acadêmica: o pagamento é simulado. Nenhum valor é cobrado e nenhum dado de cartão é pedido.
          </Aviso>
        )}
        {premium ? (
          <>
            <p>Sua assinatura está ativa. Ao cancelar, o registro por foto é desativado e os seus registros continuam guardados.</p>
            <button className="botao botao-secundario" disabled={ocupado} onClick={() => void executar(api.cancelarAssinatura)}>
              Cancelar assinatura
            </button>
          </>
        ) : (
          <button className="botao" disabled={ocupado} onClick={() => void executar(api.assinar)}>
            Assinar o premium
          </button>
        )}
      </section>

      {/* RN20: consentimento separado para a IA, revogável a qualquer momento. */}
      <section className="cartao" aria-labelledby="titulo-ia">
        <h2 id="titulo-ia">Registro de refeições com IA</h2>
        <p>
          Com o seu consentimento, a descrição da refeição (ou a foto, no premium) é enviada a um provedor de IA externo
          só para identificar alimentos e quantidades. O seu nome e o seu e-mail não são enviados, e as fotos não ficam
          guardadas. Os carboidratos e as proteínas de uma refeição são sempre calculados pela base de alimentos, e
          nada é gravado sem a sua confirmação. Ao criar um alimento novo com IA, os valores são estimativas que você
          confere antes de salvar. A leitura da prescrição envia o documento que você escolher e pede a sua
          confirmação a cada uso.
        </p>
        <label className="marcar marcar-destaque">
          <input
            type="checkbox"
            checked={conta.ia.consentida}
            disabled={ocupado}
            onChange={(e) => void executar(() => api.consentirIA(e.target.checked))}
          />
          <span>
            <strong>Concordo com o envio do conteúdo das minhas refeições à IA.</strong>
          </span>
        </label>
        <p className="texto-apoio">
          {conta.ia.consentida
            ? `Usos hoje: ${conta.ia.usosHoje} de ${conta.ia.limiteDiario}.`
            : 'Sem este consentimento, o registro com IA fica desativado e o registro manual segue disponível.'}{' '}
          {!conta.ia.configurada &&
            'A IA ainda não foi configurada neste servidor, então o registro com IA está indisponível por enquanto.'}
        </p>
      </section>

      <section className="cartao" aria-labelledby="titulo-dados">
        <h2 id="titulo-dados">Seus dados</h2>
        <p>
          Você consentiu com o tratamento dos seus dados de saúde em{' '}
          {new Date(conta.consentimentoEm).toLocaleDateString('pt-BR')}. Eles são usados só para montar a sua dieta, o
          painel, os lembretes e o relatório, e não são compartilhados nem usados para publicidade.
        </p>
        <p>
          Para revogar esse consentimento, exclua a conta: todos os seus dados são apagados na hora e não podem ser
          recuperados.
        </p>
        {erroExclusao && <Aviso tipo="erro">{erroExclusao}</Aviso>}
        <form onSubmit={excluir} className="formulario-linha">
          <label className="campo">
            <span>Confirme a sua senha para excluir</span>
            <input type="password" autoComplete="current-password" required value={senha} onChange={(e) => setSenha(e.target.value)} />
          </label>
          <div className="acoes">
            <button className="botao botao-perigo">Excluir conta e dados</button>
          </div>
        </form>
      </section>
    </>
  )
}
