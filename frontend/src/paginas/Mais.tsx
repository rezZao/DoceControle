import { Link } from 'react-router-dom'
import { Icone } from '../componentes/Base'
import { useConta, useContaAtiva } from '../conta'

const itens = [
  { para: '/historico', titulo: 'Histórico', ajuda: 'Seus dias e gráficos' },
  { para: '/prescricao', titulo: 'Prescrição e lembretes', ajuda: 'Limites do médico e horários de insulina' },
  { para: '/relatorio', titulo: 'Relatório para a consulta', ajuda: 'Para imprimir ou salvar em PDF' },
  { para: '/conta', titulo: 'Conta e plano', ajuda: 'Premium, IA e seus dados' },
]

export function Mais() {
  const conta = useContaAtiva()
  const { sair } = useConta()

  return (
    <>
      <h1>Mais</h1>
      <p className="texto-apoio">{conta.nome}</p>
      <ul className="lista-menu">
        {itens.map((item) => (
          <li key={item.para}>
            <Link to={item.para}>
              <span>
                <strong>{item.titulo}</strong>
                <small>{item.ajuda}</small>
              </span>
              <Icone nome="chevron-dir" />
            </Link>
          </li>
        ))}
      </ul>
      <button className="botao botao-secundario botao-largo" onClick={() => void sair()}>
        Sair
      </button>
    </>
  )
}
