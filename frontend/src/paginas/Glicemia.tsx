import { useState } from 'react'
import { api, type Glicemia as RegistroGlicemia } from '../api'
import { Aviso, Carregando, Orientacao } from '../componentes/Base'
import { FormularioGlicemia, ListaGlicemias } from '../componentes/Glicemias'
import { dataIso, useDados } from '../util'

export function Glicemia() {
  const { dados, erro, recarregar } = useDados(() => api.relatorio(dataIso(), 7), [])
  const [edicao, setEdicao] = useState<RegistroGlicemia | null>(null)

  if (erro) return <Aviso tipo="erro">{erro}</Aviso>
  if (!dados) return <Carregando />

  const faixa = dados.prescricaoVigente
  const recentes = [...dados.glicemias].reverse()

  return (
    <>
      <h1>Glicemia</h1>
      <section className="cartao">
        <h2>{edicao ? 'Alterar medição' : 'Nova medição'}</h2>
        {faixa ? (
          <p className="texto-apoio">
            Faixa informada pelo seu médico: {faixa.glicemiaMin} a {faixa.glicemiaMax} mg/dL.
          </p>
        ) : (
          <p className="texto-apoio">
            Você ainda não cadastrou a faixa de glicemia prescrita. As medições são guardadas, mas não são comparadas
            com nenhuma faixa.
          </p>
        )}
        <FormularioGlicemia
          edicao={edicao}
          aoCancelar={() => setEdicao(null)}
          aoGravar={() => {
            setEdicao(null)
            void recarregar()
          }}
        />
        <Orientacao texto={dados.avisoOrientacao} />
      </section>

      <section className="cartao" aria-labelledby="titulo-recentes">
        <h2 id="titulo-recentes">Últimos 7 dias</h2>
        <ListaGlicemias glicemias={recentes} comData aoEditar={setEdicao} aoMudar={() => void recarregar()} />
      </section>
    </>
  )
}
