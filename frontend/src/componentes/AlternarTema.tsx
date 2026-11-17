import { useState } from 'react'
import { definirTema, temaAtual, type Tema } from '../tema'
import { Icone } from './Base'

export function AlternarTema() {
  const [tema, setTema] = useState<Tema>(temaAtual)
  const escuro = tema === 'escuro'
  const rotulo = escuro ? 'Mudar para o modo claro' : 'Mudar para o modo escuro'

  function trocar() {
    const novo: Tema = escuro ? 'claro' : 'escuro'
    definirTema(novo)
    setTema(novo)
  }

  return (
    <button type="button" className="botao-icone botao-tema" onClick={trocar} aria-label={rotulo} title={rotulo}>
      <Icone nome={escuro ? 'sol' : 'lua'} tamanho={24} />
    </button>
  )
}
