# Verificação desta versão

## Feito em Node.js

Build com Vite 7.1.12 para uma subpasta (`/english/`) e sete testes de lógica/cache:
- Sequências independentes por item/forma/habilidade, limite de 10 e reset individual.
- Listening exige reprodução concluída e credita também EN→PT quando correto.
- Erro no áudio não altera EN→PT antes da etapa de leitura.
- Segunda tentativa por texto não restaura listening.
- Erro persistido não é contado duas vezes; Próxima só avança.
- Revisão após o intervalo, fim de fila e limite de uma reapresentação.
- Snapshots completos, manutenção da versão anterior em falha e cache opcional do motor.

## Feito em Chromium 134 com viewport de celular

Interface com o banco existente de 30 itens: estudo por texto, retomada após recarregar, solução após erro, ajustes escondendo a lição, migração do histórico, reset e preservação do japonês.
Listening em duas etapas e persistência foram testados com uma thread de áudio simulada, para exercitar os estados sem depender da rede ou inferência.
Foram verificadas larguras de 320, 390, 768 e 1280 px sem overflow horizontal na tela de estudo. Captura inspecionada visualmente.

## Piper real

A voz oficial Alan medium foi baixada pelo ambiente de linha de comando e servida localmente ao navegador de teste: os bytes do modelo e da configuração eram os oficiais, sem simular o Piper, ONNX, fonemizador ou reprodução.
O Piper gerou e reproduziu inglês no navegador. Depois de a página ser recarregada com rede offline e sem a rota local do modelo, uma nova geração/reprodução passou, usando voz e motor guardados.
O navegador deste ambiente não conseguiu acessar diretamente o Hugging Face (`ERR_EMPTY_RESPONSE`); portanto o download externo direto por navegador não foi validado aqui. O aplicativo mantém o endereço público oficial para o usuário e trata a falha com Tentar novamente.

## Não feito

Celular físico, Safari/iOS, escuta humana da voz, instalação pelo menu do sistema ou publicação em GitHub Pages.
O tempo de geração e a liberação de autoplay precisam ser conferidos no aparelho do usuário.

## Reproduzir

`npm ci`, `npm test`, `npm run build`.
O teste do navegador usa Playwright/Chromium; para instalar o navegador, `npx playwright install chromium --only-shell`.

`npm run test:browser` compila para `/english/` e executa o fluxo de interface com áudio simulado.
Para incluir inferência real, defina `TEST_PIPER=1`. Por padrão, usará o download público; para repetir o teste com os bytes oficiais locais, informe também `TEST_MODEL_PATH` e `TEST_CONFIG_PATH`.
`TEST_CHROMIUM_PATH` permite apontar um Chromium já instalado.
