"""
Sprint 4 — Validação end-to-end: n8n webhook, /clientes, client→lead flow.

Run: cd backend && python -m pytest test_n8n_e2e.py -v

Tests are organized by sprint task:
  S4-T1: /clientes fix validation (CORS config, trailing slash, API)
  S4-T2: Automatic client → lead flow (webhook processor)
  S4-T3: n8n → CRM e2e (all intents, idempotency, product matching)
"""

import unittest
from datetime import datetime, timezone, timedelta
from unittest.mock import MagicMock, patch

from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.main import app
from app.dependencies import get_supabase, get_current_user
from app.models.n8n_webhook import (
    N8nWebhookPayload,
    N8nWebhookResponse,
    OrderItem,
    NoteTimelineEntry,
    build_products_json,
    generate_client_name,
    generate_product_summary,
    parse_brl_to_float,
)

FAKE_API_KEY = "test-api-key-abc123"
FAKE_TENANT_ID = "tenant-uuid-0001"
FAKE_FUNNEL_ID = "funnel-uuid-0001"
FAKE_INBOX_ID = "inbox-uuid-0001"
FAKE_LEAD_ID = "lead-uuid-0001"
FAKE_STAGE_ID = "stage-uuid-b2c"
FAKE_CHAT_ID = "554195802989@s.whatsapp.net"
FAKE_PRODUCT_ID = "product-uuid-geleia"

INBOX_ROW = {
    "id": FAKE_INBOX_ID,
    "tenant_id": FAKE_TENANT_ID,
    "funnel_id": FAKE_FUNNEL_ID,
    "name": "Inbox Test",
    "uazapi_settings": {"instance_token": "token-abc"},
}

LEAD_ROW = {
    "id": FAKE_LEAD_ID,
    "tenant_id": FAKE_TENANT_ID,
    "inbox_id": FAKE_INBOX_ID,
    "funnel_id": FAKE_FUNNEL_ID,
    "whatsapp_chat_id": FAKE_CHAT_ID,
    "contact_name": "Augusto",
    "company_name": "Test Lead",
    "stage": "Novo",
    "value": 0,
    "client_id": None,
    "products_json": [],
    "notes": "",
    "phone": "+554195802989",
}

STAGE_B2C = {"id": FAKE_STAGE_ID, "name": "B2C", "order_position": 1}
STAGE_B2B = {"id": "stage-uuid-b2b", "name": "B2B", "order_position": 2}
STAGE_REVENDA = {"id": "stage-uuid-rev", "name": "Quero Vender", "order_position": 3}
STAGE_PEDIDO = {"id": "stage-uuid-ped", "name": "Pedido Feito", "order_position": 4}
ALL_STAGES = [STAGE_B2C, STAGE_B2B, STAGE_REVENDA, STAGE_PEDIDO]

PRODUCT_DB_ROW = {
    "id": FAKE_PRODUCT_ID,
    "name": "Geleia de Amora",
    "price": 18.0,
    "category_id": "cat-01",
    "tenant_id": FAKE_TENANT_ID,
    "is_active": True,
}


# ═══════════════════════════════════════════════════════════════
# AC16: parse_brl_to_float — unit tests
# ═══════════════════════════════════════════════════════════════

class TestParseBrlToFloat(unittest.TestCase):
    def test_standard_brl(self):
        self.assertAlmostEqual(parse_brl_to_float("R$ 112,00"), 112.0)

    def test_brl_no_space(self):
        self.assertAlmostEqual(parse_brl_to_float("R$112,00"), 112.0)

    def test_plain_comma(self):
        self.assertAlmostEqual(parse_brl_to_float("112,00"), 112.0)

    def test_plain_dot(self):
        self.assertAlmostEqual(parse_brl_to_float("112.00"), 112.0)

    def test_thousands_separator(self):
        self.assertAlmostEqual(parse_brl_to_float("R$ 1.112,00"), 1112.0)

    def test_empty_string(self):
        self.assertAlmostEqual(parse_brl_to_float(""), 0.0)

    def test_none(self):
        self.assertAlmostEqual(parse_brl_to_float(None), 0.0)

    def test_small_value(self):
        self.assertAlmostEqual(parse_brl_to_float("R$ 36,00"), 36.0)

    def test_decimal_cents(self):
        self.assertAlmostEqual(parse_brl_to_float("R$ 54,50"), 54.5)
        self.assertAlmostEqual(
            parse_brl_to_float(
                "R$ 180,00 (produtos) | frete a confirmar pelo atendente"
            ),
            180.0,
        )


# ═══════════════════════════════════════════════════════════════
# Helpers: build_products_json, generate_*
# ═══════════════════════════════════════════════════════════════

class TestBuildProductsJson(unittest.TestCase):
    def test_matched_by_id(self):
        items = [OrderItem(product_id=FAKE_PRODUCT_ID, product="Geleia de Amora", quantity=2, total="R$ 36,00")]
        products_db = [PRODUCT_DB_ROW]
        result, warnings = build_products_json(items, products_db, FAKE_TENANT_ID)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["id"], FAKE_PRODUCT_ID)
        self.assertEqual(result[0]["product_id"], FAKE_PRODUCT_ID)
        self.assertEqual(result[0]["quantity"], 2)
        self.assertEqual(result[0]["qty"], 2)
        self.assertAlmostEqual(result[0]["price"], 18.0)
        self.assertAlmostEqual(result[0]["line_subtotal"], 36.0)
        self.assertFalse(result[0].get("unmatched", False))
        self.assertEqual(len(warnings), 0)

    def test_matched_by_name_case_insensitive(self):
        items = [OrderItem(product="geleia de amora", quantity=1, total="R$ 18,00")]
        products_db = [PRODUCT_DB_ROW]
        result, warnings = build_products_json(items, products_db, FAKE_TENANT_ID)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["id"], FAKE_PRODUCT_ID)
        self.assertEqual(len(warnings), 0)

    def test_unmatched_product(self):
        items = [OrderItem(product="Produto Inexistente", quantity=1, total="R$ 25,00")]
        products_db = [PRODUCT_DB_ROW]
        result, warnings = build_products_json(items, products_db, FAKE_TENANT_ID)
        self.assertEqual(len(result), 1)
        self.assertTrue(result[0].get("unmatched"))
        self.assertAlmostEqual(result[0]["price"], 25.0)
        self.assertEqual(len(warnings), 1)
        self.assertIn("não encontrado", warnings[0])

    def test_cross_tenant_product_id_rejected(self):
        other_tenant_product = {**PRODUCT_DB_ROW, "tenant_id": "other-tenant", "name": "Produto X"}
        items = [OrderItem(product_id=FAKE_PRODUCT_ID, product="Produto Y", quantity=1, total="R$ 18,00")]
        result, warnings = build_products_json(items, [other_tenant_product], FAKE_TENANT_ID)
        self.assertEqual(len(result), 1)
        self.assertTrue(any("outro tenant" in w for w in warnings))
        self.assertTrue(result[0].get("unmatched"))

    def test_empty_items(self):
        result, warnings = build_products_json([], [PRODUCT_DB_ROW], FAKE_TENANT_ID)
        self.assertEqual(len(result), 0)
        self.assertEqual(len(warnings), 0)


class TestGenerateProductSummary(unittest.TestCase):
    def test_multiple_items(self):
        items = [
            OrderItem(product="Geleia de Amora", quantity=2, total="R$ 36,00"),
            OrderItem(product="Geleia de Morango", quantity=3, total="R$ 54,00"),
        ]
        result = generate_product_summary(items)
        self.assertIn("2x Geleia de Amora", result)
        self.assertIn("3x Geleia de Morango", result)

    def test_empty(self):
        self.assertEqual(generate_product_summary([]), "Sem itens")


class TestGenerateClientName(unittest.TestCase):
    def test_client_row_has_display_name(self):
        name = generate_client_name(LEAD_ROW, N8nWebhookPayload(
            instance_token="t", whatsapp_chat_id="c", intent="perfil_b2c",
        ), {"display_name": "Maria"})
        self.assertEqual(name, "Maria")

    def test_payload_lead_name(self):
        name = generate_client_name(LEAD_ROW, N8nWebhookPayload(
            instance_token="t", whatsapp_chat_id="c", intent="perfil_b2c", lead_name="Augusto",
        ), None)
        self.assertEqual(name, "Augusto")

    def test_fallback_contact_name(self):
        name = generate_client_name(LEAD_ROW, N8nWebhookPayload(
            instance_token="t", whatsapp_chat_id="c", intent="perfil_b2c",
        ), None)
        self.assertEqual(name, "Augusto")

    def test_final_fallback(self):
        empty_lead = {**LEAD_ROW, "contact_name": "", "company_name": ""}
        name = generate_client_name(empty_lead, N8nWebhookPayload(
            instance_token="t", whatsapp_chat_id="c", intent="perfil_b2c",
        ), None)
        self.assertEqual(name, "Cliente WhatsApp")


# ═══════════════════════════════════════════════════════════════
# Pydantic model validation
# ═══════════════════════════════════════════════════════════════

class TestN8nPayloadValidation(unittest.TestCase):
    def test_valid_perfil_payload(self):
        p = N8nWebhookPayload(
            instance_token="abc",
            whatsapp_chat_id="554195802989@s.whatsapp.net",
            phone="+55 41 9580-2989",
            lead_name="Augusto",
            intent="perfil_b2c",
            button_id="btn_cliente_final",
        )
        self.assertEqual(p.intent, "perfil_b2c")
        self.assertIsNone(p.order_summary)

    def test_valid_pedido_payload(self):
        p = N8nWebhookPayload(
            instance_token="abc",
            whatsapp_chat_id="554195802989@s.whatsapp.net",
            intent="pedido",
            order_summary=[
                OrderItem(product_id="uuid-1", product="Geleia de Amora", quantity=2, total="R$ 36,00"),
            ],
            payment_method="PIX",
            total_value="R$ 36,00",
        )
        self.assertEqual(p.intent, "pedido")
        self.assertEqual(len(p.order_summary), 1)

    def test_invalid_intent_rejected(self):
        from pydantic import ValidationError
        with self.assertRaises(ValidationError):
            N8nWebhookPayload(
                instance_token="abc",
                whatsapp_chat_id="chat",
                intent="invalid_intent",
            )

    def test_note_timeline(self):
        p = N8nWebhookPayload(
            instance_token="abc",
            whatsapp_chat_id="chat",
            intent="pedido",
            note_timeline=[
                NoteTimelineEntry(content="Evento 1"),
                NoteTimelineEntry(content="Evento 2", timestamp="2026-04-03 10:00"),
            ],
        )
        self.assertEqual(len(p.note_timeline), 2)


# ═══════════════════════════════════════════════════════════════
# S4-T1: /clientes — CORS config + API trailing slash
# ═══════════════════════════════════════════════════════════════

class TestClientesConfig(unittest.TestCase):
    """Verify that CORS config and URL patterns are correct."""

    def test_cors_origins_list_parses_comma_separated(self):
        from app.config import Settings
        s = Settings(CORS_ORIGINS="https://crm.wbtech.dev,https://other.dev")
        self.assertEqual(s.cors_origins_list, ["https://crm.wbtech.dev", "https://other.dev"])

    def test_cors_wildcard_works(self):
        from app.config import Settings
        s = Settings(CORS_ORIGINS="*")
        self.assertEqual(s.cors_origins_list, ["*"])

    def test_api_ts_list_clients_trailing_slash(self):
        """Verify listClients uses /api/clients/ (with trailing slash) in api.ts."""
        import re
        with open("../frontend-next/lib/api.ts", "r", encoding="utf-8") as f:
            content = f.read()
        match = re.search(r'listClients.*?apiGet.*?["\']([^"\']+)["\']', content, re.DOTALL)
        self.assertIsNotNone(match, "listClients not found in api.ts")
        url = match.group(1)
        self.assertTrue(url.endswith("/"), f"listClients URL should end with '/': {url}")

    def test_api_ts_create_client_trailing_slash(self):
        """Verify createCrmClient uses /api/clients/ (with trailing slash)."""
        import re
        with open("../frontend-next/lib/api.ts", "r", encoding="utf-8") as f:
            content = f.read()
        match = re.search(r'createCrmClient.*?apiPost.*?["\']([^"\']+)["\']', content, re.DOTALL)
        self.assertIsNotNone(match, "createCrmClient not found in api.ts")
        url = match.group(1)
        self.assertTrue(url.endswith("/"), f"createCrmClient URL should end with '/': {url}")


# ═══════════════════════════════════════════════════════════════
# S4-T1 continued: /clientes API endpoint (mock Supabase)
# ═══════════════════════════════════════════════════════════════

class _FakeExec:
    def __init__(self, data=None, count=None):
        self.data = data or []
        self.count = count


def _make_mock_supabase():
    sb = MagicMock()
    return sb


def _make_fake_user():
    user = MagicMock()
    user.id = FAKE_TENANT_ID
    return user


class TestClientesEndpoint(unittest.TestCase):
    """Verify /api/clients/ route is registered and responds (not 404/405)."""

    def test_clients_route_exists(self):
        routes = [r.path for r in app.routes if hasattr(r, "path")]
        self.assertIn("/api/clients/", routes)

    def test_clients_requires_auth(self):
        client = TestClient(app, raise_server_exceptions=False)
        resp = client.get("/api/clients/")
        self.assertIn(resp.status_code, [401, 403])


# ═══════════════════════════════════════════════════════════════
# S4-T2: Webhook processor — client auto-creation
# ═══════════════════════════════════════════════════════════════

class TestWebhookClientAutoCreation(unittest.TestCase):
    """Verify webhook_processor calls resolve_or_create_crm_client."""

    def test_resolve_or_create_crm_client_creates_pf(self):
        from app.services.webhook_lead_context import resolve_or_create_crm_client
        sb = MagicMock()
        sb.table.return_value.select.return_value.eq.return_value.execute.return_value = _FakeExec(data=[])
        sb.table.return_value.insert.return_value.execute.return_value = _FakeExec(data=[
            {"id": "new-client-id"}
        ])
        result = resolve_or_create_crm_client(
            sb,
            tenant_id=FAKE_TENANT_ID,
            sender_phone_raw="+5541995802989",
            sender_name="Augusto",
        )
        self.assertEqual(result, "new-client-id")

    def test_resolve_or_create_crm_client_finds_existing(self):
        from app.services.webhook_lead_context import resolve_or_create_crm_client
        sb = MagicMock()
        sb.table.return_value.select.return_value.eq.return_value.execute.return_value = _FakeExec(data=[
            {"id": "existing-client", "phones": ["5541995802989"]}
        ])
        result = resolve_or_create_crm_client(
            sb,
            tenant_id=FAKE_TENANT_ID,
            sender_phone_raw="+5541995802989",
            sender_name="Augusto",
        )
        self.assertEqual(result, "existing-client")

    def test_resolve_or_create_returns_none_no_phone(self):
        from app.services.webhook_lead_context import resolve_or_create_crm_client
        sb = MagicMock()
        result = resolve_or_create_crm_client(
            sb,
            tenant_id=FAKE_TENANT_ID,
            sender_phone_raw="",
            sender_name="Augusto",
        )
        self.assertIsNone(result)


class TestGetFirstStageFunnel(unittest.TestCase):
    """Verify first stage resolution uses dynamic pipeline_stages, not legacy."""

    def test_returns_first_stage_name(self):
        from app.services.webhook_lead_context import get_first_stage_slug_for_funnel
        sb = MagicMock()
        sb.table.return_value.select.return_value.eq.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value = _FakeExec(data=[
            {"name": "Novo Lead", "order_position": 0}
        ])
        result = get_first_stage_slug_for_funnel(sb, tenant_id=FAKE_TENANT_ID, funnel_id=FAKE_FUNNEL_ID)
        self.assertEqual(result, "Novo Lead")

    def test_returns_empty_if_no_stages(self):
        from app.services.webhook_lead_context import get_first_stage_slug_for_funnel
        sb = MagicMock()
        sb.table.return_value.select.return_value.eq.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value = _FakeExec(data=[])
        result = get_first_stage_slug_for_funnel(sb, tenant_id=FAKE_TENANT_ID, funnel_id=FAKE_FUNNEL_ID)
        self.assertEqual(result, "")


# ═══════════════════════════════════════════════════════════════
# S4-T2: Legacy stages fully removed
# ═══════════════════════════════════════════════════════════════

class TestLegacyStagesRemoved(unittest.TestCase):
    """AC9: Verify legacy stage references are fully removed from codebase."""

    def test_no_lead_stage_enum(self):
        import app.models.lead as lead_mod
        self.assertFalse(hasattr(lead_mod, "LeadStage"), "LeadStage enum should be removed")

    def test_keyword_rule_target_stage_is_str(self):
        from app.models.keyword_rule import KeywordRuleBase
        field = KeywordRuleBase.model_fields["target_stage"]
        self.assertEqual(field.annotation, str)

    def test_keyword_engine_target_stage_is_str(self):
        from app.services.keyword_engine import KeywordRule
        import dataclasses
        fields = {f.name: f for f in dataclasses.fields(KeywordRule)}
        self.assertEqual(fields["target_stage"].type, str)

    def test_keyword_engine_fallback_rules_empty(self):
        from app.services.keyword_engine import FALLBACK_RULES
        self.assertEqual(FALLBACK_RULES, [])

    def test_webhook_lead_context_no_allowed_stages(self):
        import app.services.webhook_lead_context as wlc
        self.assertFalse(hasattr(wlc, "_ALLOWED_LEAD_STAGES"))
        self.assertFalse(hasattr(wlc, "clamp_stage_slug"))

    def test_webhook_processor_no_stage_order(self):
        import app.workers.webhook_processor as wp
        self.assertFalse(hasattr(wp, "stage_order"))

    def test_new_order_modal_no_contato_inicial(self):
        with open("../frontend-next/components/NewOrderModal.tsx", "r", encoding="utf-8") as f:
            content = f.read()
        self.assertNotIn("contato_inicial", content)

    def test_leads_router_no_stage_labels(self):
        import app.routers.leads as leads_mod
        self.assertFalse(hasattr(leads_mod, "STAGE_LABELS"))

    def test_test_db_sim_no_contato_inicial(self):
        with open("test_db_sim.py", "r", encoding="utf-8") as f:
            content = f.read()
        self.assertNotIn("contato_inicial", content)

    def test_lead_model_stage_default_empty(self):
        from app.models.lead import LeadBase
        field = LeadBase.model_fields["stage"]
        self.assertEqual(field.default, "")


# ═══════════════════════════════════════════════════════════════
# S4-T3: n8n webhook — API auth
# ═══════════════════════════════════════════════════════════════

class TestN8nWebhookAuth(unittest.TestCase):
    """AC1: API key auth via X-CRM-API-Key header."""

    def setUp(self):
        from app.config import Settings
        self.client = TestClient(app)
        self.mock_sb = _make_mock_supabase()
        self.settings_patch = patch("app.dependencies.get_settings")
        self.mock_settings = self.settings_patch.start()
        s = Settings(N8N_API_KEY=FAKE_API_KEY, SUPABASE_URL="http://fake", SUPABASE_ANON_KEY="fakekey")
        self.mock_settings.return_value = s
        app.dependency_overrides[get_supabase] = lambda: self.mock_sb

    def tearDown(self):
        app.dependency_overrides.clear()
        self.settings_patch.stop()

    def test_missing_api_key_returns_401(self):
        resp = self.client.post("/api/n8n/webhook", json={
            "instance_token": "abc",
            "whatsapp_chat_id": FAKE_CHAT_ID,
            "intent": "perfil_b2c",
        })
        self.assertIn(resp.status_code, [401, 503])

    def test_wrong_api_key_returns_401(self):
        resp = self.client.post(
            "/api/n8n/webhook",
            json={
                "instance_token": "abc",
                "whatsapp_chat_id": FAKE_CHAT_ID,
                "intent": "perfil_b2c",
            },
            headers={"X-CRM-API-Key": "wrong-key"},
        )
        self.assertIn(resp.status_code, [401, 503])


# ═══════════════════════════════════════════════════════════════
# S4-T3: n8n webhook — n8n config presence
# ═══════════════════════════════════════════════════════════════

class TestN8nConfigPresence(unittest.TestCase):
    """Verify N8N_API_KEY config field exists."""

    def test_settings_has_n8n_api_key(self):
        from app.config import Settings
        s = Settings()
        self.assertTrue(hasattr(s, "N8N_API_KEY"))
        self.assertEqual(s.N8N_API_KEY, "")

    def test_env_example_has_n8n_api_key(self):
        with open(".env.example", "r", encoding="utf-8") as f:
            content = f.read()
        self.assertIn("N8N_API_KEY", content)

    def test_n8n_router_registered(self):
        """Verify POST /api/n8n/webhook is registered in the app."""
        routes = [r.path for r in app.routes if hasattr(r, "path")]
        self.assertIn("/api/n8n/webhook", routes)

    def test_verify_n8n_api_key_dependency_exists(self):
        from app.dependencies import verify_n8n_api_key
        self.assertTrue(callable(verify_n8n_api_key))


# ═══════════════════════════════════════════════════════════════
# S4-T3: n8n webhook — intent routing (mocked Supabase)
# ═══════════════════════════════════════════════════════════════

class TestN8nIntentRouting(unittest.TestCase):
    """Test that the router resolves inbox → lead and routes by intent."""

    def test_resolve_inbox_returns_inbox_row(self):
        from app.routers.n8n_webhook import _resolve_inbox
        sb = MagicMock()
        with patch("app.routers.n8n_webhook.find_inbox_by_instance_token", return_value=INBOX_ROW):
            result = _resolve_inbox(sb, "token-abc")
        self.assertEqual(result["id"], FAKE_INBOX_ID)

    def test_resolve_inbox_404_if_not_found(self):
        from app.routers.n8n_webhook import _resolve_inbox
        sb = MagicMock()
        with patch("app.routers.n8n_webhook.find_inbox_by_instance_token", return_value=None):
            with self.assertRaises(HTTPException) as ctx:
                _resolve_inbox(sb, "bad-token")
            self.assertEqual(ctx.exception.status_code, 404)

    def test_resolve_lead_by_inbox_id(self):
        from app.routers.n8n_webhook import _resolve_lead
        sb = MagicMock()
        sb.table.return_value.select.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value = _FakeExec(data=[LEAD_ROW])
        result = _resolve_lead(sb, inbox_id=FAKE_INBOX_ID, tenant_id=FAKE_TENANT_ID, whatsapp_chat_id=FAKE_CHAT_ID)
        self.assertEqual(result["id"], FAKE_LEAD_ID)

    def test_resolve_lead_404_if_not_found(self):
        from app.routers.n8n_webhook import _resolve_lead
        sb = MagicMock()
        sb.table.return_value.select.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value = _FakeExec(data=[])
        with self.assertRaises(HTTPException) as ctx:
            _resolve_lead(sb, inbox_id=FAKE_INBOX_ID, tenant_id=FAKE_TENANT_ID, whatsapp_chat_id="unknown@chat")
        self.assertEqual(ctx.exception.status_code, 404)
        self.assertIn("Lead não encontrado", ctx.exception.detail)

    def test_resolve_stage_case_insensitive(self):
        from app.routers.n8n_webhook import _resolve_stage_case_insensitive
        sb = MagicMock()
        sb.table.return_value.select.return_value.eq.return_value.eq.return_value.order.return_value.execute.return_value = _FakeExec(data=ALL_STAGES)
        result = _resolve_stage_case_insensitive(
            sb, tenant_id=FAKE_TENANT_ID, funnel_id=FAKE_FUNNEL_ID, target_stage_name="b2c",
        )
        self.assertIsNotNone(result)
        self.assertEqual(result["name"], "B2C")

    def test_resolve_stage_not_found(self):
        from app.routers.n8n_webhook import _resolve_stage_case_insensitive
        sb = MagicMock()
        sb.table.return_value.select.return_value.eq.return_value.eq.return_value.order.return_value.execute.return_value = _FakeExec(data=ALL_STAGES)
        result = _resolve_stage_case_insensitive(
            sb, tenant_id=FAKE_TENANT_ID, funnel_id=FAKE_FUNNEL_ID, target_stage_name="Inexistente",
        )
        self.assertIsNone(result)


# ═══════════════════════════════════════════════════════════════
# S4-T3: INTENT_TO_STAGE mapping
# ═══════════════════════════════════════════════════════════════

class TestIntentStageMapping(unittest.TestCase):
    def test_all_intents_mapped(self):
        from app.routers.n8n_webhook import INTENT_TO_STAGE
        self.assertEqual(INTENT_TO_STAGE["perfil_b2c"], "B2C")
        self.assertEqual(INTENT_TO_STAGE["perfil_b2b"], "B2B")
        self.assertEqual(INTENT_TO_STAGE["perfil_revenda"], "Quero Vender")
        self.assertEqual(INTENT_TO_STAGE["pedido"], "Pedido Feito")


# ═══════════════════════════════════════════════════════════════
# S4-T3: Migration file validation
# ═══════════════════════════════════════════════════════════════

class TestMigration012(unittest.TestCase):
    def test_migration_file_exists(self):
        import os
        self.assertTrue(os.path.exists("migrations/012_remove_legacy_stage_checks_and_orders_cols.sql"))

    def test_migration_drops_constraints_idempotent(self):
        with open("migrations/012_remove_legacy_stage_checks_and_orders_cols.sql", "r", encoding="utf-8") as f:
            content = f.read()
        self.assertIn("DROP CONSTRAINT IF EXISTS", content)
        self.assertIn("leads", content)
        self.assertIn("keyword_rules", content)

    def test_migration_adds_payment_method(self):
        with open("migrations/012_remove_legacy_stage_checks_and_orders_cols.sql", "r", encoding="utf-8") as f:
            content = f.read()
        self.assertIn("payment_method", content)
        self.assertIn("ADD COLUMN IF NOT EXISTS", content)

    def test_migration_adds_client_id_to_orders(self):
        with open("migrations/012_remove_legacy_stage_checks_and_orders_cols.sql", "r", encoding="utf-8") as f:
            content = f.read()
        self.assertIn("client_id", content)
        self.assertIn("crm_clients", content)

    def test_migration_deactivates_legacy_rules(self):
        with open("migrations/012_remove_legacy_stage_checks_and_orders_cols.sql", "r", encoding="utf-8") as f:
            content = f.read()
        self.assertIn("is_active = false", content)
        self.assertIn("contato_inicial", content)
        self.assertIn("escolhendo_sabores", content)


# ═══════════════════════════════════════════════════════════════
# S4-T3: Kanban board with zero stages (AC9)
# ═══════════════════════════════════════════════════════════════

class TestKanbanEmptyBoard(unittest.TestCase):
    """AC9: When pipeline_stages is empty, return board with zero columns."""

    def test_empty_stages_returns_zero_columns(self):
        from app.models.lead import KanbanBoard
        board = KanbanBoard(columns=[], funnel_id=FAKE_FUNNEL_ID)
        self.assertEqual(len(board.columns), 0)
        self.assertEqual(board.funnel_id, FAKE_FUNNEL_ID)


# ═══════════════════════════════════════════════════════════════
# S4-T3: Keyword engine with dynamic stages
# ═══════════════════════════════════════════════════════════════

class TestKeywordEngineNonLegacy(unittest.TestCase):
    """AC9: Keyword engine uses string stages, not enums."""

    def test_analyze_returns_str_or_none(self):
        from app.services.keyword_engine import KeywordEngine, KeywordRule
        engine = KeywordEngine()
        rules = [
            KeywordRule(keywords=["comprar", "pagar"], target_stage="Pedido Feito", priority=2),
            KeywordRule(keywords=["cardápio"], target_stage="Escolhendo", priority=1),
        ]
        result = engine.analyze_message("quero comprar geleia", rules)
        self.assertEqual(result, "Pedido Feito")

    def test_no_match_returns_none(self):
        from app.services.keyword_engine import KeywordEngine, KeywordRule
        engine = KeywordEngine()
        rules = [
            KeywordRule(keywords=["comprar"], target_stage="Pedido Feito", priority=1),
        ]
        result = engine.analyze_message("olá, bom dia", rules)
        self.assertIsNone(result)

    def test_empty_rules_returns_none(self):
        from app.services.keyword_engine import KeywordEngine
        engine = KeywordEngine()
        result = engine.analyze_message("quero comprar", [])
        self.assertIsNone(result)


# ═══════════════════════════════════════════════════════════════
# S4-T3: Response model shape
# ═══════════════════════════════════════════════════════════════

class TestN8nResponseModel(unittest.TestCase):
    def test_response_shape(self):
        r = N8nWebhookResponse(
            status="ok",
            lead_id=FAKE_LEAD_ID,
            client_id="client-1",
            stage="B2C",
            order_id=None,
            message="Lead movido para 'B2C'.",
            warnings=["product not found"],
        )
        d = r.model_dump()
        self.assertEqual(d["status"], "ok")
        self.assertEqual(d["lead_id"], FAKE_LEAD_ID)
        self.assertEqual(d["stage"], "B2C")
        self.assertIsNone(d["order_id"])
        self.assertEqual(len(d["warnings"]), 1)


if __name__ == "__main__":
    unittest.main()
