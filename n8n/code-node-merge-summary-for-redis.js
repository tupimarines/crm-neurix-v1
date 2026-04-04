/**
 * NODE: Colocar após o Summarization Chain e antes do Redis SET.
 *
 * O chain costuma devolver só {{ $json.output.text }}.
 * O last_order_context vem do nó "Atualizar Contexto" — não do LLM.
 * Este nó junta os dois para um único item JSON.
 *
 * Ajuste os nomes dos nós se forem diferentes no teu workflow:
 *   - Summarization: nó imediatamente anterior (entrada $input) OU $('Summarization Chain')
 *   - Atualizar Contexto: $('Atualizar Contexto')
 */

// Saída do Summarization (entrada deste Code = conexão do chain)
const chain = $input.first().json;
const summaryText =
  chain.output?.text ??
  chain.text ??
  chain.data?.text ??
  '';

// Carrinho mesclado (já calculado antes do chain)
let ctx = {};
try {
  ctx = $('Atualizar Contexto').first().json || {};
} catch {
  ctx = {};
}

const last_order_context = String(ctx.last_order_context || '').trim();

return [
  {
    json: {
      /** Texto do summarization — grave como lead_context no Redis */
      lead_context: summaryText,
      /** Copiado do Atualizar Contexto — grave como last_order_context no Redis */
      last_order_context,
      /** Atalho se o nó Redis esperar o mesmo formato do chain */
      output: { text: summaryText },
      remotejid: ctx.remotejid,
      pushName: ctx.pushName,
    },
  },
];
