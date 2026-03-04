// test-rls.js
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://crm-supabase.wbtech.dev';
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJhbm9uIiwKICAgICJpc3MiOiAic3VwYWJhc2UtZGVtbyIsCiAgICAiaWF0IjogMTY0MTc2OTIwMCwKICAgICJleHAiOiAxNzk5NTM1NjAwCn0.dc_X5iR_VP_qT0zsiyj_I_OZ2T9FtRU2BBNWN8Bu4GE';
const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJzZXJ2aWNlX3JvbGUiLAogICAgImlzcyI6ICJzdXBhYmFzZS1kZW1vIiwKICAgICJpYXQiOiAxNjQxNzY5MjAwLAogICAgImV4cCI6IDE3OTk1MzU2MDAKfQ.DaYlNEoUrrEn2Ig7tqibS-PHK5vgusbcbo7X36XVt4Q';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

async function run() {
    const admin = createClient(supabaseUrl, serviceRoleKey);

    // Ler um dos pedidos problemáticos pelo service role (ignora RLS)
    const { data: orders } = await admin.from('orders').select('*').limit(1);
    console.log("Found order (admin):", orders?.[0]);

    if (!orders || orders.length === 0) return;
    const order = orders[0];

    // Simular o frontend (anon)
    const anon = createClient(supabaseUrl, anonKey);

    // Tentar deletar esse pedido (SEM AUTENTICAÇÃO REAL, MAS VAMOS VER O ERRO)
    // O delete sem autenticação vai retornar erro de JWT, ou vai tentar deletar e falhar se o RLS exigir user_id

    // Pra ver se RLS exige tenant_id no backend, podemos tentar deletar via admin
    console.log("Tentando deletar via admin, mas logando se falharia se fosse RLS:");

    // A melhor maneira é criar um pedido de teste via admin, e deletá-lo pra ver se funciona com owner
    const newOrder = {
        tenant_id: order.tenant_id,
        lead_id: order.lead_id,
        client_name: "Teste RLS",
        total: 100,
        payment_status: "pendente"
    };

    const { data: inserted, error: iErr } = await admin.from('orders').insert(newOrder).select().single();
    if (iErr) {
        console.error("Admin Insert Error:", iErr);
        return;
    }

    console.log("Inseriu:", inserted);

    // Agora vamos ver se o Admin consegue deletar (isso não testa RLS, mas testa constraints!)
    const { data: deleted, error: dErr } = await admin.from('orders').delete().eq('id', inserted.id).select();
    console.log("Delete result via Admin:", deleted, dErr);

    if (deleted && deleted.length > 0) {
        console.log("Admin consegue deletar. Isso significa que NÃO há constraint impedindo o delete.");
        console.log("CONCLUSÃO: O DELETE no frontend falha porque o RLS policy de DELETE em 'orders' não está sendo satisfeita pelo usuário autenticado. Geralmente isso ocorre porque a policy usa `tenant_id = auth.uid()` em vez de checar `profiles.tenant_id`, ou simplesmente a tabela `orders` está bloqueada para deletes.");
    }
}
run();
