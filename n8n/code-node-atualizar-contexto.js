/**
 * NODE: Atualizar Contexto (após o agente / antes do Summarization Chain)
 *
 * Problema que resolve: quando o lead manda só "pix", o agente pode devolver
 * order_context vazio → o textoParaResumo "ensina" o summarizer que não há carrinho.
 *
 * Solução:
 * 1) Mesclar carrinho: se order_context atual estiver vazio, reutilizar
 *    `last_order_context` gravado no Redis OU trechos do resumo anterior.
 * 2) Gravar no Redis (nó seguinte) `last_order_context` com o carrinho mesclado
 *    sempre que não for vazio — além do `lead_context` que o chain já gera.
 *
 * Redis GET (nó "get-context"): além de `lead_context`, suportar opcional:
 *   { "lead_context": "...", "last_order_context": "📋 PEDIDO ATUAL ..." }
 *
 * Nós esperados: 'get-context', 'Dados', 'output-agent'
 */

function formatarTimestamp(ts) {
  if (!ts) return 'Data não disponível';
  const data = new Date(ts);
  return `${data.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' })} às ${data.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })}`;
}

/** True se o texto indica carrinho vazio (alinhado ao order_context do agente). */
function isCarrinhoVazio(texto) {
  const t = String(texto || '')
    .trim()
    .toLowerCase();
  if (!t) return true;
  if (t.includes('nenhum item registrado')) return true;
  if (/pedido atual do cliente:\s*nenhum item/i.test(t)) return true;
  if (/^nenhum item\.?$/.test(t)) return true;
  if (/^carrinho_de_compras:\s*nenhum item\b/im.test(t)) return true;
  if (/carrinho[^\n]{0,40}vazio/i.test(t)) return true;
  return false;
}

/** Extrai bloco [STATUS DO CARRINHO APÓS INTERAÇÃO] de um textoParaResumo antigo. */
function extrairStatusCarrinhoDoTextoParaResumo(full) {
  const m = String(full || '').match(
    /\[STATUS DO CARRINHO APÓS INTERAÇÃO\]\s*\n([\s\S]*?)(?=\n\n\[|$)/,
  );
  return m ? m[1].trim() : '';
}

/** Extrai linha CARRINHO_DE_COMPRAS: do resumo estruturado do chain. */
function extrairCarrinhoDeComprasLinha(leadContext) {
  const lines = String(leadContext || '').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^CARRINHO_DE_COMPRAS\s*:/i.test(trimmed)) {
      return trimmed.replace(/^CARRINHO_DE_COMPRAS\s*:\s*/i, '').trim();
    }
  }
  return '';
}

/** Extrai bloco 📋 PEDIDO ATUAL DO CLIENTE ... (formato order_context do agente). */
function extrairPedidoAtualCliente(texto) {
  const s = String(texto || '');
  const m = s.match(
    /(📋 PEDIDO ATUAL DO CLIENTE[\s\S]*?)(?=\n\n[^\n]|$)/,
  );
  return m ? m[1].trim() : '';
}

/** Melhor esforço: carrinho persistido legível a partir do que já está no Redis. */
function carrinhoDoResumoAnterior(resumoAnterior) {
  const raw = String(resumoAnterior || '').trim();
  if (!raw) return '';

  const doBlocoResumo = extrairStatusCarrinhoDoTextoParaResumo(raw);
  if (!isCarrinhoVazio(doBlocoResumo)) return doBlocoResumo;

  const linha = extrairCarrinhoDeComprasLinha(raw);
  if (linha && !/^nenhum item$/i.test(linha.trim())) {
    return `📋 PEDIDO ATUAL DO CLIENTE (via resumo persistido):\n  ${linha}`;
  }

  const pedido = extrairPedidoAtualCliente(raw);
  if (!isCarrinhoVazio(pedido)) return pedido;

  return '';
}

function mesclarCarrinho({ carrinhoAgente, lastOrderRedis, resumoAnterior }) {
  if (!isCarrinhoVazio(carrinhoAgente)) {
    return { merged: String(carrinhoAgente).trim(), fonte: 'agente' };
  }
  const fromRedis = String(lastOrderRedis || '').trim();
  if (!isCarrinhoVazio(fromRedis)) {
    return { merged: fromRedis, fonte: 'redis_last_order_context' };
  }
  const fromAntigo = carrinhoDoResumoAnterior(resumoAnterior);
  if (!isCarrinhoVazio(fromAntigo)) {
    return { merged: fromAntigo, fonte: 'resumo_anterior' };
  }
  return { merged: String(carrinhoAgente || '').trim(), fonte: 'vazio' };
}

// ── 1. Redis GET ───────────────────────────────────────────────────────────
let ctxRow = {};
try {
  ctxRow = $('get-context').first().json || {};
} catch {
  ctxRow = {};
}

let resumoAnterior = ctxRow.lead_context || '';
resumoAnterior = resumoAnterior.replace(/===.*?===/g, '').trim();

const lastOrderRedis = ctxRow.last_order_context || ctxRow.lastOrderContext || '';

// ── 2. Webhook ─────────────────────────────────────────────────────────────
const dados = $('Dados').first().json;
const remotejid = dados.RemoteJid;
const pushName = dados.pushName;
const mensagemLead = dados.conversation;
const timestampFormatado = formatarTimestamp(dados.timestamp);

// ── 3. Agente ──────────────────────────────────────────────────────────────
const outputLimpo = $('output-agent').first().json;
const mensagemBot = outputLimpo.message;
const carrinhoAgente = outputLimpo.order_context;

const { merged: carrinhoParaResumo, fonte: carrinhoFonte } = mesclarCarrinho({
  carrinhoAgente,
  lastOrderRedis,
  resumoAnterior,
});

const secaoResumoAnterior = resumoAnterior
  ? `[ESTADO ANTERIOR]\n${resumoAnterior}`
  : '[ESTADO ANTERIOR]\nVazio (Início da conversa)';

const notaMerge =
  carrinhoFonte !== 'agente' && carrinhoFonte !== 'vazio'
    ? `\n[NOTA PARA O RESUMO]\nO agente não repetiu o pedido nesta mensagem; o bloco de carrinho abaixo foi mantido a partir de ${carrinhoFonte === 'redis_last_order_context' ? 'last_order_context (Redis)' : 'contexto anterior'}.\n`
    : '';

const secaoNovasMensagens = `\n[INTERAÇÃO ATUAL - ${timestampFormatado}]\nLead (${pushName}): ${mensagemLead}\nAgente (Dorinha): ${mensagemBot}\n${notaMerge}\n[STATUS DO CARRINHO APÓS INTERAÇÃO]\n${carrinhoParaResumo}`;

const textoParaResumo = `${secaoResumoAnterior}\n${secaoNovasMensagens}`;

/** Gravar no Redis junto com lead_context após o Summarization (HASH ou JSON). */
const last_order_context_para_gravar = isCarrinhoVazio(carrinhoParaResumo)
  ? ''
  : carrinhoParaResumo;

return [
  {
    json: {
      remotejid,
      pushName,
      timestamp: timestampFormatado,
      mensagemRecebida: mensagemLead,
      respostaBot: mensagemBot,
      textoParaResumo,
      /** Debug no n8n */
      _carrinho_fonte: carrinhoFonte,
      _carrinho_agente_bruto: carrinhoAgente,
      /** Use no nó Redis SET (mesma chave do lead + campo last_order_context) */
      last_order_context: last_order_context_para_gravar,
    },
  },
];
