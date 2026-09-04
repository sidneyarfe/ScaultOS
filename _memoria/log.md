# Log

> Registro cronológico **append-only** de eventos do negócio: cliente novo, proposta
> (enviada / vencida / ganha / perdida), contrato (emitido / assinado / encerrado).
> Só cresce — nunca reescrever ou apagar linha antiga. O estado *atual* (quem é
> cliente hoje, o que está em aberto agora) continua em `empresa.md` e
> `estrategia.md`; aqui fica o histórico datado que sustenta essas sínteses.
>
> Data em ISO (AAAA-MM-DD), diferente do resto do projeto — é o formato que ordena
> certo como texto puro, sem precisar de ferramenta pra ler o histórico em ordem.
>
> Formato da linha: `- **[AAAA-MM-DD]** tipo — descrição (referência se houver)`.

## Histórico
