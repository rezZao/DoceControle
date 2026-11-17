// tema claro por padrão; o botão do cabeçalho liga o escuro e a escolha fica guardada no navegador
export type Tema = 'claro' | 'escuro'

const CHAVE = 'docecontrole-tema'
const COR_DA_BARRA: Record<Tema, string> = { claro: '#f9f5e9', escuro: '#0c130e' }

let escolhido: Tema = 'claro'

function lerSalvo(): Tema {
  try {
    return localStorage.getItem(CHAVE) === 'escuro' ? 'escuro' : 'claro'
  } catch {
    return 'claro' // armazenamento bloqueado (janela privada, por exemplo): vale só nesta sessão
  }
}

function pintar(tema: Tema) {
  const raiz = document.documentElement
  if (tema === 'escuro') raiz.dataset.tema = 'escuro'
  else delete raiz.dataset.tema
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', COR_DA_BARRA[tema])
  document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', tema)
}

export function temaAtual(): Tema {
  return escolhido
}

export function definirTema(tema: Tema) {
  escolhido = tema
  pintar(tema)
  try {
    localStorage.setItem(CHAVE, tema)
  } catch {
    /* sem armazenamento: a escolha não sobrevive ao fechar a página */
  }
}

export function iniciarTema() {
  escolhido = lerSalvo()
  pintar(escolhido)
  window.addEventListener('beforeprint', () => pintar('claro'))
  window.addEventListener('afterprint', () => pintar(escolhido))
}
