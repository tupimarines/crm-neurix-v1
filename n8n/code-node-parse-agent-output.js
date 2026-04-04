/**
 * n8n Code node — parseia o output estruturado do agente.
 * Copie o conteúdo para o nó Code após o agente.
 *
 * Saídas úteis para CRM:
 * - instance_token, whatsapp_chat_id: vindos do nó "Dados" (webhook WhatsApp)
 * - crm_sync_pedido_feito: true → chamar POST /api/n8n/webhook com intent "pedido"
 * - pedido_confirmado: leitura bruta do campo (útil para debug)
 *
 * RESUMO DO PEDIDO — formatos de linha (use o UUID do consulta_cardapio quando possível):
 * - Com product_id: 6 – 5265b616-3cc6-4037-9955-ba4e910d4739 – Geleia de morango – R$ 108,00
 * - Só nome:       6 – Geleia de Morango – R$ 108,00
 */

const text = $input.first().json.output || '';
const lines = text.split('\n').map((l) => l.trim()).filter((l) => l);

/** RemoteJid + token-instance do nó "Dados" (mesmo nome do nó no workflow). */
let whatsapp_chat_id = '';
let instance_token = '';
try {
  const dados = $('Dados').first().json;
  if (dados) {
    whatsapp_chat_id = String(dados.RemoteJid ?? '').trim();
    instance_token = String(dados['token-instance'] ?? '').trim();
  }
} catch {
  // Nó "Dados" ausente ou sem execução — CRM recebe strings vazias
}

function getLineValue(label) {
  const line = lines.find((l) => l.toLowerCase().startsWith(label.toLowerCase()));
  if (!line) return '';
  return line.split(':').slice(1).join(':').trim();
}

function getSection(startLabel) {
  const startIndex = lines.findIndex((l) => l.startsWith(startLabel));
  if (startIndex === -1) return '';
  const collected = [];
  for (let i = startIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^[A-ZÇÃÕÉÍÓÚÂÊÔÜ ]+:$/.test(line)) break;
    collected.push(line);
  }
  return collected.join('\n').trim();
}

/** SIM / confirmado → true; NÃO / vazio → false */
function isAffirmative(value) {
  const v = String(value || '').trim().toLowerCase();
  if (!v) return false;
  if (/^(não|nao|n|no|false|n\/a|nenhum|cancelado|negativo)\b/i.test(v)) return false;
  return /^(sim|s|yes|y|confirmado|confirmada|fechado|ok)\b/i.test(v);
}

const perfilRaw = getLineValue('PERFIL:');
const perfil = perfilRaw.toUpperCase().includes('B2B') ? 'b2b' : 'b2c';

const rawIntent = getLineValue('INTENÇÃO:');
let intent = 'desconhecido';
if (/saudaç/i.test(rawIntent)) intent = 'saudacao';
else if (/fechamento/i.test(rawIntent)) intent = 'fechamento_venda';
else if (/pedido/i.test(rawIntent)) intent = 'pedido';
else if (/dúvida|duvida/i.test(rawIntent)) intent = 'duvida';

const leadBlock = getSection('DADOS DO LEAD:');
let name = '';
let cnpj = '';
let phone = '';

leadBlock.split('\n').forEach((line) => {
  const lower = line.toLowerCase();
  if (lower.startsWith('nome:')) name = line.split(':').slice(1).join(':').trim();
  else if (lower.startsWith('cnpj:')) cnpj = line.split(':').slice(1).join(':').trim();
  else if (lower.startsWith('telefone:')) phone = line.split(':').slice(1).join(':').trim();
});

const normalize = (v) =>
  !v || /não informado|não aplicável/i.test(v) ? '' : v;

name = normalize(name);
cnpj = normalize(cnpj);
phone = normalize(phone);

const summary = getSection('RESUMO DA CONVERSA:');

const timelineBlock = getSection('LINHA DO TEMPO:');
const timeline = [];
timelineBlock
  .split('\n')
  .map((l) => l.replace(/^-+\s*/, '').trim())
  .filter((l) => l)
  .forEach((content) => timeline.push({ timestamp: '', content }));

const pedidoBlock = getSection('RESUMO DO PEDIDO:');
const order_summary = [];

/** UUID v4 — usado após a quantidade quando o agente inclui product_id do cardápio. */
const UUID_SEGMENT =
  '([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})';

/**
 * Extrai um item do RESUMO DO PEDIDO. Tenta primeiro linha com UUID (evita ambiguidade com nomes).
 */
function parseOrderLine(raw) {
  const line = raw.trim();
  if (!line || /^nenhum item/i.test(line)) return null;

  // Qty – UUID – Produto – R$ valor
  let m = line.match(
    new RegExp(
      `^(\\d+)\\s*[–-]\\s*${UUID_SEGMENT}\\s*[–-]\\s*(.+?)\\s*[–-]\\s*R\\$\\s*([\\d.,]+)$`,
    ),
  );
  if (m) {
    return {
      quantity: parseInt(m[1], 10),
      product_id: m[2],
      product: m[3].trim(),
      total: `R$ ${m[4].trim()}`,
    };
  }

  // Qty – Produto – R$ valor
  m = line.match(/^(\d+)\s*[–-]\s*(.+?)\s*[–-]\s*R\$\s*([\d.,]+)$/);
  if (m) {
    return {
      quantity: parseInt(m[1], 10),
      product: m[2].trim(),
      total: `R$ ${m[3].trim()}`,
    };
  }

  // Qty – UUID – Produto (sem R$)
  m = line.match(
    new RegExp(`^(\\d+)\\s*[–-]\\s*${UUID_SEGMENT}\\s*[–-]\\s*(.+)$`),
  );
  if (m) {
    return {
      quantity: parseInt(m[1], 10),
      product_id: m[2],
      product: m[3].trim(),
      total: '',
    };
  }

  // Qty – Produto (sem R$)
  m = line.match(/^(\d+)\s*[–-]\s*(.+)$/);
  if (m) {
    return {
      quantity: parseInt(m[1], 10),
      product: m[2].trim(),
      total: '',
    };
  }

  return null;
}

pedidoBlock
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l)
  .forEach((line) => {
    const item = parseOrderLine(line);
    if (item) order_summary.push(item);
  });

const payment_method = normalize(getLineValue('FORMA DE PAGAMENTO:'));
const total_value = normalize(getLineValue('VALOR TOTAL:'));
const message = getSection('MENSAGEM FINAL PARA O CLIENTE:');

// ── Confirmação de pedido (CRM: intent "pedido" → etapa "Pedido Feito") ──
const pedidoConfirmadoRaw =
  getLineValue('PEDIDO CONFIRMADO:') ||
  getLineValue('CONFIRMAÇÃO DO PEDIDO:') ||
  getLineValue('PEDIDO FEITO:');

const pedido_confirmado = isAffirmative(pedidoConfirmadoRaw);
// Evita chamar o webhook de pedido sem itens parseados (ajuste o IF se precisar outro critério)
const crm_sync_pedido_feito = pedido_confirmado && order_summary.length > 0;

let order_context = '';

if (order_summary.length > 0) {
  const itemLines = order_summary
    .map((i) => `  • ${i.quantity}x ${i.product}${i.total ? ' — ' + i.total : ''}`)
    .join('\n');

  order_context =
    `📋 PEDIDO ATUAL DO CLIENTE (sempre reflita este estado):\n` +
    itemLines +
    (total_value ? `\n  💰 Total: ${total_value}` : '') +
    (payment_method ? `\n  💳 Pagamento: ${payment_method}` : '');
} else {
  order_context = '📋 PEDIDO ATUAL DO CLIENTE: Nenhum item registrado ainda.';
}

const result = {
  perfil,
  intent,
  summary,
  message,
  order_context,
  instance_token,
  whatsapp_chat_id,
  lead: { name, cnpj, phone },
  order_summary,
  payment_method,
  total_value,
  note: { timeline },
  pedido_confirmado,
  crm_sync_pedido_feito,
  crm_webhook_intent_pedido: crm_sync_pedido_feito ? 'pedido' : null,
};

return [{ json: result }];

/*
================================================================================
POST /api/n8n/webhook — corpo JSON no n8n (HTTP Request)

Não use só order_summary[0]: envie o array inteiro com JSON.stringify.
note_timeline = note.timeline do payload (eventos variáveis), não texto fixo.

--- Opção A: JSON com campos (arrays sem aspas em volta do stringify) ---

{
  "instance_token": "{{ $('Dados').item.json['token-instance'] }}",
  "whatsapp_chat_id": "{{ $('Dados').item.json.RemoteJid }}",
  "phone": "{{ $('webhook').item.json.body.chat.phone }}",
  "lead_name": "{{ $json.lead.name || $('Dados').item.json.pushName }}",
  "intent": "pedido",
  "order_summary": {{ JSON.stringify($json.order_summary || []) }},
  "payment_method": "{{ $json.payment_method }}",
  "total_value": "{{ ($json.total_value || '').toString().split('(')[0].trim() }}",
  "note_timeline": {{ JSON.stringify(($json.note && $json.note.timeline) ? $json.note.timeline : []) }}
}

Se $json não tiver lead.name, use só pushName:
  "lead_name": "{{ $('Dados').item.json.pushName }}",

--- Opção B: corpo inteiro como expressão (n8n) ---

={{ JSON.stringify({
  instance_token: $('Dados').first().json['token-instance'],
  whatsapp_chat_id: $('Dados').first().json.RemoteJid,
  phone: $('webhook').first().json.body.chat.phone,
  lead_name: ($json.lead && $json.lead.name) ? $json.lead.name : $('Dados').first().json.pushName,
  intent: 'pedido',
  order_summary: $json.order_summary || [],
  payment_method: $json.payment_method,
  total_value: ($json.total_value || '').toString().split('(')[0].trim(),
  note_timeline: ($json.note && $json.note.timeline) ? $json.note.timeline : []
}) }}

Ajuste $('NomeDoNo') se o webhook ou Dados tiverem outro nome.
================================================================================
*/
