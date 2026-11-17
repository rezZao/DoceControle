// lê o código de barras da foto no próprio navegador (BarcodeDetector ou, na falta, uma leitora em WebAssembly local)

const FORMATOS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'] as const

interface Detector {
  detect(imagem: ImageBitmap): Promise<{ rawValue: string }[]>
}

let detector: Promise<Detector> | null = null

async function criarDetector(): Promise<Detector> {
  const nativo = (globalThis as { BarcodeDetector?: new (opcoes: { formats: string[] }) => Detector }).BarcodeDetector
  if (nativo) {
    try {
      return new nativo({ formats: [...FORMATOS] })
    } catch {
      // Formatos não aceitos pelo navegador: cai para a leitora em WebAssembly.
    }
  }

  const [ponyfill, wasm] = await Promise.all([
    import('barcode-detector/ponyfill'),
    import('../node_modules/zxing-wasm/dist/reader/zxing_reader.wasm?url'),
  ])
  ponyfill.prepareZXingModule({
    overrides: {
      locateFile: (caminho: string, prefixo: string) => (caminho.endsWith('.wasm') ? wasm.default : prefixo + caminho),
    },
  })
  return new ponyfill.BarcodeDetector({ formats: [...FORMATOS] }) as unknown as Detector
}

export async function lerCodigoDeBarras(arquivo: Blob): Promise<string | null> {
  detector ??= criarDetector()
  let leitora: Detector
  try {
    leitora = await detector
  } catch {
    detector = null
    return null
  }

  const imagem = await createImageBitmap(arquivo)
  try {
    const achados = await leitora.detect(imagem)
    return achados.map((a) => a.rawValue).find((v) => /^\d{8,14}$/.test(v)) ?? null
  } catch {
    return null
  } finally {
    imagem.close()
  }
}
