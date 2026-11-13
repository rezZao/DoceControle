import { useEffect, useRef } from 'react'
import { Link, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { Carregando, Icone } from './componentes/Base'
import { ProvedorLembretes } from './componentes/Lembretes'
import { useConta } from './conta'
import { Cadastro, Entrar } from './paginas/Entrada'
import { Painel } from './paginas/Painel'
import { Dieta } from './paginas/Dieta'
import { Refeicao } from './paginas/Refeicao'
import { Glicemia } from './paginas/Glicemia'
import { Historico } from './paginas/Historico'
import { PrescricaoPagina } from './paginas/Prescricao'
import { RelatorioPagina } from './paginas/Relatorio'
import { ContaPagina } from './paginas/Conta'
import { Mais } from './paginas/Mais'

interface ItemMenu {
  para: string
  rotulo: string
  icone: 'casa' | 'prato' | 'mais' | 'gota' | 'menu'
  /** Rotas que também deixam este item marcado. */
  alias?: string[]
  destaque?: boolean
}

// No celular vira uma barra de abas embaixo (com "Registrar" em destaque); em telas largas, fica no topo.
const menu: ItemMenu[] = [
  { para: '/', rotulo: 'Hoje', icone: 'casa' },
  { para: '/dieta', rotulo: 'Dieta', icone: 'prato' },
  { para: '/refeicao/nova', rotulo: 'Registrar', icone: 'mais', alias: ['/refeicao'], destaque: true },
  { para: '/glicemia', rotulo: 'Glicemia', icone: 'gota' },
  { para: '/mais', rotulo: 'Mais', icone: 'menu', alias: ['/historico', '/prescricao', '/conta', '/relatorio'] },
]

function ativo(item: ItemMenu, caminho: string) {
  if (item.para === '/') return caminho === '/'
  return [item.para, ...(item.alias ?? [])].some((p) => caminho === p || caminho.startsWith(p + '/'))
}

function AreaLogada() {
  const { conta } = useConta()
  const local = useLocation()
  const principal = useRef<HTMLElement>(null)

  // Ao trocar de tela, leva o foco ao conteúdo para quem navega por teclado ou leitor de tela.
  useEffect(() => {
    principal.current?.focus({ preventScroll: true })
    window.scrollTo(0, 0)
  }, [local.pathname])

  if (!conta) return <Navigate to="/entrar" replace />

  return (
    <ProvedorLembretes>
      <a className="pular" href="#conteudo">
        Pular para o conteúdo
      </a>
      <header className="topo">
        <div className="topo-linha">
          <Link to="/" className="marca">
            <span className="marca-gota" aria-hidden="true" />
            DoceControle
          </Link>
          <nav className="menu" aria-label="Principal">
            {menu.map((item) => {
              const marcado = ativo(item, local.pathname)
              return (
                <Link
                  key={item.para}
                  to={item.para}
                  className={item.destaque ? 'menu-destaque' : undefined}
                  aria-current={marcado ? 'page' : undefined}
                >
                  <span className="menu-icone">
                    <Icone nome={item.icone} tamanho={item.destaque ? 28 : 24} />
                  </span>
                  <span>{item.rotulo}</span>
                </Link>
              )
            })}
          </nav>
        </div>
      </header>
      <main id="conteudo" className="conteudo" tabIndex={-1} ref={principal}>
        <Outlet />
      </main>
    </ProvedorLembretes>
  )
}

function AreaAberta() {
  const { conta } = useConta()
  if (conta) return <Navigate to="/" replace />
  return (
    <main className="conteudo conteudo-estreito">
      <p className="marca marca-grande">
        <span className="marca-gota" aria-hidden="true" />
        DoceControle
      </p>
      <Outlet />
    </main>
  )
}

export function App() {
  const { carregando } = useConta()
  if (carregando) {
    return (
      <main className="conteudo conteudo-estreito">
        <Carregando />
      </main>
    )
  }

  return (
    <Routes>
      <Route element={<AreaAberta />}>
        <Route path="/entrar" element={<Entrar />} />
        <Route path="/cadastro" element={<Cadastro />} />
      </Route>
      <Route element={<AreaLogada />}>
        <Route path="/" element={<Painel />} />
        <Route path="/dieta" element={<Dieta />} />
        <Route path="/refeicao/nova" element={<Refeicao />} />
        <Route path="/refeicao/:id" element={<Refeicao />} />
        <Route path="/glicemia" element={<Glicemia />} />
        <Route path="/mais" element={<Mais />} />
        <Route path="/historico" element={<Historico />} />
        <Route path="/prescricao" element={<PrescricaoPagina />} />
        <Route path="/relatorio" element={<RelatorioPagina />} />
        <Route path="/conta" element={<ContaPagina />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
