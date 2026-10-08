# Conteúdo existente

O `data.js` atual é mantido na raiz. O Vite copia para `public/data.js` durante desenvolvimento/build; ele é carregado separadamente, preservando IDs e permitindo atualizações de programação sem enviar o banco novamente.
Formato: `window.STUDY_DATA = [...]`.

Campos principais por item:

| Campo | Uso |
| --- | --- |
| id | ID único e estável |
| category | noun, verb, adjective, adverb, other, phrase ou paragraph |
| english | Texto inglês / forma base |
| portuguese | Tradução correspondente |
| situations | Lista de IDs definidos no catalog.js |
| forms.present | Objeto com english e portuguese, de preferência em uma frase curta |
| forms.past | Objeto com english e portuguese, em contexto |

Verbos treinam base, presente e passado automaticamente, se houver conteúdo nessas formas. As outras categorias treinam seu par principal.
Campos antigos como exemplos, notas, particípio, terceira pessoa, -ing e missões não são apagados do banco; apenas não entram nesta interface/treino.
A palavra mantém o mesmo ID em situações diferentes. O progresso não é duplicado por situação.
O áudio sempre usa o inglês exato do par atual e a mesma voz em inglês; português não é sintetizado.
Adicionar cartões muda o denominador das barras, sem apagar sequências anteriores.
