import { defineConfig } from 'vite'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { createHash } from 'node:crypto'

// Lista todos os arquivos da pasta public/ (ícones, imagens, manifest).
function listarArquivosPublicos(pasta, base = pasta) {
  return readdirSync(pasta).flatMap((nome) => {
    const caminho = join(pasta, nome)
    if (statSync(caminho).isDirectory()) return listarArquivosPublicos(caminho, base)
    if (nome.startsWith('.')) return [] // ignora arquivos ocultos, como .DS_Store
    return ['/' + relative(base, caminho).split('\\').join('/')]
  })
}

// Gera o /sw.js no build a partir de src/service-worker.js,
// preenchendo a lista de arquivos do aplicativo e a versão do cache.
// A versão muda sempre que algum arquivo muda, o que faz o navegador
// instalar a versão nova do aplicativo e apagar o cache antigo.
function gerarServiceWorker() {
  return {
    name: 'passcheck-service-worker',
    apply: 'build',
    generateBundle(_opcoes, bundle) {
      const arquivosDoBuild = Object.keys(bundle)
        .filter((nome) => nome !== 'index.html' && !nome.endsWith('.map'))
        .map((nome) => '/' + nome)

      const arquivosPublicos = listarArquivosPublicos('public')
      const arquivos = ['/index.html', ...arquivosDoBuild, ...arquivosPublicos].sort()

      const modelo = readFileSync('src/service-worker.js', 'utf8')

      // Versão = resumo (hash) de tudo que compõe o aplicativo.
      // Os arquivos de /assets já têm um hash no nome, então basta a lista de nomes;
      // index.html e os arquivos de public/ entram pelo conteúdo.
      const resumo = createHash('sha256')
      resumo.update(modelo)
      resumo.update(arquivos.join('\n'))
      resumo.update(readFileSync('index.html'))
      arquivosPublicos.forEach((url) => resumo.update(readFileSync(join('public', url))))
      const versao = resumo.digest('hex').slice(0, 12)

      const codigo = modelo
        .replace("'__VERSAO__'", JSON.stringify(versao))
        .replace("['__ARQUIVOS__']", JSON.stringify(arquivos, null, 2))

      this.emitFile({ type: 'asset', fileName: 'sw.js', source: codigo })
    },
  }
}

// Endereços do túnel HTTPS da Cloudflare usados para testar no celular.
// O ponto inicial libera qualquer endereço *.trycloudflare.com, já que muda a cada túnel.
const enderecosPermitidos = ['.trycloudflare.com']

export default defineConfig({
  plugins: [gerarServiceWorker()],
  server: {
    allowedHosts: enderecosPermitidos,
  },
  preview: {
    allowedHosts: enderecosPermitidos,
  },
})
