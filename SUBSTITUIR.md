# English Quest v2 — interface simples + Piper

1. Para começar do zero, extraia o ZIP numa pasta nova. Para atualizar, substitua os arquivos correspondentes do projeto English Quest.
2. Este pacote completo inclui `data.js` com 30 itens de teste. Se você já tem um banco próprio, mantenha seu `data.js` em vez de substituí-lo pelo exemplo. O Vite copia esse arquivo para a pasta pública automaticamente.
3. Mantenha o mesmo endereço de publicação para preservar o acesso ao progresso desse navegador.
4. Não substitua o projeto japonês Japcket.

## Testar localmente

Use Node.js 22.12 ou mais recente. Na pasta do projeto:

```sh
npm install
npm run dev
```

Abra o endereço indicado pelo Vite. O banco de 30 itens que você já recebeu funciona sem alterações.
O áudio exige internet no primeiro uso para baixar a voz. O estudo por texto funciona sem ativá-lo.

## GitHub Pages

A publicação agora usa o resultado do build, e não os arquivos da raiz diretamente.

- Envie os arquivos atualizados, incluindo `public/`, `package-lock.json` e `.github/workflows/deploy.yml`, ao repositório.
- Deixe seu `data.js` anterior versionado na raiz.
- Em Settings → Pages → Source, selecione **GitHub Actions**.
- O workflow incluído publica a branch `main`. Se sua branch principal tiver outro nome, ajuste o campo `branches` no workflow.
- O workflow calcula automaticamente o caminho do repositório, compila e publica `dist`.

Nada foi enviado ou publicado no GitHub durante esta alteração.

Para compilar manualmente: `npm run build`. Ao hospedar numa subpasta, defina `VITE_BASE_PATH`, por exemplo `/english-quest/`, durante o build. O servidor não executa Vite: ele só entrega os arquivos estáticos já compilados.

## Progresso

A nova regra usa `english-quest-v2`. Cada item, forma e habilidade tem uma sequência independente de até 10 acertos; erro zera apenas a sequência afetada.
O estado anterior `english-quest-v1` é conservado intacto e arquivado em `legacyV1` no novo estado. Suas preferências compatíveis são reaproveitadas.
Os níveis antigos não representavam acertos consecutivos, portanto não são convertidos em sequências fictícias: as novas barras começam em zero. As estatísticas e a rodada antigas continuam no arquivo histórico.
O progresso japonês não é lido nem alterado.
Zerar progresso exige confirmação, apaga o histórico inglês e mantém preferências e voz baixada.

## Áudio

- Ativar Listening ou Ler inglês automaticamente inicia a preparação da voz.
- O ícone de áudio também permite preparar e reproduzir manualmente, sem ativar leitura automática.
- Voz escolhida: `en_GB-alan-medium`, inglês britânico.
- Download inicial: aproximadamente 93 MB, incluindo uma variante do ONNX Runtime, o fonemizador e a voz de 63,2 MB. O fallback sem SIMD só é usado em navegadores que precisem dele.
- Os arquivos do motor vêm do próprio site; a voz vem do repositório oficial de vozes no Hugging Face.
- A voz fica em OPFS; os binários ficam em Cache Storage. Ondas já geradas têm um cache limitado em memória.
- Se o navegador apagar os dados do site, pode ser necessário preparar a voz novamente.
- O navegador pode exigir um toque para começar o som. Nesse caso, use o ícone.
- A falha mostra Tentar novamente; nenhum acerto de listening é permitido antes de completar uma reprodução.

A pasta `public/tts/` é gerada durante `npm ci` + `npm run build`/`npm run dev`; não precisa entrar no seu git. Não há backend, microfone, serviço pago ou chave de API.
