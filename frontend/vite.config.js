
import { defineConfig } from 'vite'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { createHash } from 'node:crypto'

// Lista todos os arquivos da pasta public/
function listarArquivosPublicos(pasta, base = pasta) {
  return readdirSync(pasta).flatMap((nome) => {
    const caminho = join(pasta, nome)

    if (statSync(caminho).isDirectory()) {
      return listarArquivosPublicos(caminho, base)
    }

    if (nome.startsWith('.')) return []

    return ['/' + relative(base, caminho).split('\\').join('/')]
  })
}

// Gera o Service Worker durante o build
function gerarServiceWorker() {
  return {
    name: 'passcheck-service-worker',
    apply: 'build',

    generateBundle(_opcoes, bundle) {
      const arquivosDoBuild = Object.keys(bundle)
        .filter((nome) => nome !== 'index.html' && !nome.endsWith('.map'))
        .map((nome) => '/' + nome)

      const arquivosPublicos = listarArquivosPublicos('public')

      const arquivos = [
        '/index.html',
        ...arquivosDoBuild,
        ...arquivosPublicos,
      ].sort()

      const modelo = readFileSync(
        'src/service-worker.js',
        'utf8'
      )

      const resumo = createHash('sha256')

      resumo.update(modelo)
      resumo.update(arquivos.join('\n'))
      resumo.update(readFileSync('index.html'))

      arquivosPublicos.forEach((url) => {
        resumo.update(readFileSync(join('public', url)))
      })

      const versao = resumo.digest('hex').slice(0, 12)

      const codigo = modelo
        .replace("'__VERSAO__'", JSON.stringify(versao))
        .replace("['__ARQUIVOS__']", JSON.stringify(arquivos, null, 2))

      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: codigo,
      })
    },
  }
}

// Hosts autorizados para acessar o PassCheck
const enderecosPermitidos = [
  'localhost',
  '127.0.0.1',
  'portions-avoid-distances-housing.trycloudflare.com',
  '.trycloudflare.com',
]

export default defineConfig({
  plugins: [gerarServiceWorker()],

  server: {
    host: '127.0.0.1',
    allowedHosts: enderecosPermitidos,
  },

  preview: {
    host: '127.0.0.1',
    allowedHosts: enderecosPermitidos,
  },
})
