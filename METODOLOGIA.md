# Regras do treino

## Sequências

A chave é `[id do item, forma, habilidade]`. Formas: base, presente e passado; não há configuração de formas nem missões na interface.
Habilidades: EN→PT, PT→EN e listening em inglês.
Cada sequência vai de 0 a 10; um acerto soma 1, limitado a 10; um erro zera só a sequência afetada.
Não há datas de revisão, crédito limitado por dia, quatro avaliações nem conversão dos níveis antigos.
Proficiência é a soma das sequências dividida por 10 × quantidade de desafios daquela habilidade, considerando todo o banco e as três formas básicas existentes.
Só chega a 100% quando todos os desafios elegíveis têm 10 acertos consecutivos.

## Texto

- Sei: registra o acerto e avança.
- Não sei: registra o erro imediatamente, mostra a solução e oferece Próxima.
- Próxima: avança sem registrar outro erro.

Mostra apenas o par sendo treinado: sem notas, exemplos extras ou metadados de categoria/forma no cartão.

## Listening

1. Aparece só o ícone de áudio. O som é gerado e tocado; os controles são liberados quando uma reprodução termina.
2. Sei soma 1 em listening e EN→PT desse mesmo item/forma e avança.
3. Não sei zera listening e mostra o texto inglês; EN→PT ainda não é alterado.
4. A segunda tentativa, agora com texto, é EN→PT: Sei soma 1 somente em EN→PT e avança; Não sei zera somente EN→PT e mostra a tradução.
5. Próxima avança após a tradução.

Ouvir de novo não pontua. Ler ou ouvir enquanto o texto inglês está visível não afeta listening.
O cartão PT→EN não oferece áudio inglês antes do erro, porque isso entregaria a resposta.
O estado de cada etapa é persistido. Recarregar, abrir ajustes ou repetir o áudio não restaura uma sequência zerada nem registra um segundo erro automaticamente.

## Rodadas

Seleção ponderada favorece sequências baixas e histórico de erros.
O tamanho pode ser ajustado de 100 em 100, até 2000; a fila pode ser menor conforme os filtros e o banco disponível.
Ao terminar um desafio com pelo menos uma falha, ele entra uma única vez na revisão, depois de N outros desafios (padrão 20, configurável entre 1 e 2000).
Se faltarem desafios, entra no fim da fila. Uma falha na revisão não cria outra cópia.
No listening, as duas etapas pertencem ao mesmo cartão; a revisão reapresenta o desafio de áudio inteiro uma vez.
Os filtros valem para uma nova rodada. Alterar o intervalo afeta os próximos erros na rodada atual.
Nova rodada nos ajustes descarta a fila atual, mantendo as sequências.
