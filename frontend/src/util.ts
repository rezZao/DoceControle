import { useCallback, useEffect, useRef, useState } from 'react'
import { mensagemDeErro } from './api'

const dois = (n: number) => String(n).padStart(2, '0')

/** Data local no formato "yyyy-MM-dd". */
export function dataIso(d: Date = new Date()): string {
  return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`
}

/** Data e hora locais no formato dos campos datetime-local: "yyyy-MM-ddTHH:mm". */
export function dataHoraLocal(d: Date = new Date()): string {
  return `${dataIso(d)}T${dois(d.getHours())}:${dois(d.getMinutes())}`
}

/** A API recebe a hora local com segundos, sem fuso. */
export const paraApi = (dataHora: string) => (dataHora.length === 16 ? dataHora + ':00' : dataHora)

export function somarDias(iso: string, dias: number): string {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + dias)
  return dataIso(d)
}

/** "2026-11-12T08:30:00" -> "08:30" */
export const horaDe = (dataHora: string) => dataHora.slice(11, 16)

const numero = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })
export const fmt = (n: number) => numero.format(n)
export const gramas = (n: number) => `${numero.format(n)} g`

export function dataCurta(iso: string): string {
  const [, mes, dia] = iso.slice(0, 10).split('-')
  return `${dia}/${mes}`
}

export function dataLonga(iso: string): string {
  const texto = new Date(iso.slice(0, 10) + 'T12:00:00').toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

export function diaDaSemana(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')
}

/** RN06, só para a prévia na tela. O valor gravado é sempre calculado pelo servidor. */
export const nutriente = (quantidadeG: number, por100g: number) => (quantidadeG * por100g) / 100

export function lerNumero(texto: string): number | null {
  const limpo = texto.trim().replace(',', '.')
  if (limpo === '') return null
  const n = Number(limpo)
  return Number.isFinite(n) ? n : null
}

/** Carrega dados da API e permite recarregar. */
export function useDados<T>(carregar: () => Promise<T>, dependencias: unknown[]) {
  const [dados, setDados] = useState<T | undefined>(undefined)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  const pedido = useRef(0)

  const recarregar = useCallback(async () => {
    const atual = ++pedido.current
    setCarregando(true)
    try {
      const resultado = await carregar()
      if (atual !== pedido.current) return
      setDados(resultado)
      setErro(null)
    } catch (e) {
      if (atual !== pedido.current) return
      setErro(mensagemDeErro(e))
    } finally {
      if (atual === pedido.current) setCarregando(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencias)

  useEffect(() => {
    void recarregar()
  }, [recarregar])

  return { dados, erro, carregando, recarregar }
}

/** Texto de duração: "2 h 10 min", "45 min", "4 h". */
export function duracao(minutos: number): string {
  const total = Math.max(0, Math.round(minutos))
  const h = Math.floor(total / 60)
  const m = total % 60
  if (h === 0) return `${m} min`
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

/** Reduz a foto e a reencoda em JPEG no navegador, o que já descarta EXIF e localização (RN22). */
export async function prepararFoto(arquivo: Blob, ladoMaximo = 1280): Promise<string> {
  const imagem = await createImageBitmap(arquivo)
  const escala = Math.min(1, ladoMaximo / Math.max(imagem.width, imagem.height))
  const tela = document.createElement('canvas')
  tela.width = Math.round(imagem.width * escala)
  tela.height = Math.round(imagem.height * escala)
  const contexto = tela.getContext('2d')
  if (!contexto) throw new Error('Não foi possível preparar a foto neste navegador.')
  contexto.drawImage(imagem, 0, 0, tela.width, tela.height)
  imagem.close()
  return tela.toDataURL('image/jpeg', 0.85).split(',')[1]
}

/** Arquivo inteiro em base64 (usado para PDF). */
export async function arquivoParaBase64(arquivo: Blob): Promise<string> {
  const bytes = new Uint8Array(await arquivo.arrayBuffer())
  let texto = ''
  for (let i = 0; i < bytes.length; i += 0x8000) texto += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(texto)
}
