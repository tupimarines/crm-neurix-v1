"""Testes — ferramentas n8n (client-by-phone, last-order-by-phone)."""

import unittest
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from app.dependencies import get_supabase, verify_n8n_api_key
from app.main import app

FAKE_API_KEY = "test-n8n-tools-key"
FAKE_TENANT = "tenant-tools-1"
FAKE_CLIENT_ID = "client-uuid-1"

CLIENT_ROW_PJ = {
    "id": FAKE_CLIENT_ID,
    "tenant_id": FAKE_TENANT,
    "person_type": "PJ",
    "cnpj": "47992051000100",
    "cpf": None,
    "display_name": "WBT Solutions",
    "contact_name": "Aurora",
    "phones": ["554137984741"],
    "created_at": "2026-01-01T00:00:00+00:00",
    "updated_at": "2026-01-01T00:00:00+00:00",
}

ORDER_ROW = {
    "id": "order-1",
    "tenant_id": FAKE_TENANT,
    "lead_id": "lead-1",
    "client_id": FAKE_CLIENT_ID,
    "client_name": "Aurora",
    "client_company": "WBT Solutions",
    "product_summary": "2x Geleia de Amora",
    "products_json": [{"sku": "GEL-AMO", "qty": 2}],
    "applied_promotions_json": {"code": "VIP10", "pct": 10},
    "subtotal": 40.0,
    "discount_total": 4.0,
    "total": 36.0,
    "stage": "pedido_feito",
    "notes": "Entregar na recepção",
    "payment_status": "pago",
    "payment_method": "PIX",
    "created_at": "2026-03-01T12:00:00+00:00",
}


class TestN8nAgentToolHelpers(unittest.TestCase):
    def test_phone_from_jid(self):
        from app.services.n8n_agent_tools import phone_from_whatsapp_jid_or_raw

        self.assertEqual(
            phone_from_whatsapp_jid_or_raw("554137984741@s.whatsapp.net"),
            "554137984741",
        )
        self.assertEqual(phone_from_whatsapp_jid_or_raw("+55 41 3798-4741"), "554137984741")

    def test_format_cnpj(self):
        from app.services.n8n_agent_tools import format_cnpj_display

        self.assertEqual(format_cnpj_display("47992051000100"), "47.992.051/0001-00")

    def test_normalize_whatsapp_chat_id(self):
        from app.services.n8n_agent_tools import normalize_whatsapp_chat_id

        self.assertEqual(
            normalize_whatsapp_chat_id("554197889864@s.whatsapp.net"),
            "554197889864@s.whatsapp.net",
        )
        self.assertEqual(
            normalize_whatsapp_chat_id("554197889864"),
            "554197889864@s.whatsapp.net",
        )

    def test_route_hint_from_stage(self):
        from app.services.n8n_agent_tools import route_hint_from_stage

        self.assertEqual(route_hint_from_stage("B2B"), "b2b")
        self.assertEqual(route_hint_from_stage("b2c"), "b2c")
        self.assertEqual(route_hint_from_stage("Quero Vender"), "revenda")
        self.assertEqual(route_hint_from_stage("Pedido Feito"), "pedido_feito")
        self.assertEqual(route_hint_from_stage("FINALIZADO"), "finalizado")
        self.assertEqual(route_hint_from_stage("Finalizado"), "finalizado")
        self.assertEqual(route_hint_from_stage("Novo"), "other")


class TestN8nToolsHttp(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.mock_sb = MagicMock()
        app.dependency_overrides[get_supabase] = lambda: self.mock_sb
        app.dependency_overrides[verify_n8n_api_key] = lambda: {"source": "n8n"}

    def tearDown(self):
        app.dependency_overrides.clear()

    @patch("app.routers.n8n_tools.resolve_tenant_id_for_n8n", return_value=None)
    def test_client_by_phone_inbox_404(self, _mock_tid):
        r = self.client.get(
            "/api/n8n/tools/client-by-phone",
            params={"instance_token": "bad", "phone": "5541999999999@s.whatsapp.net"},
            headers={"X-CRM-API-Key": "ignored-with-override"},
        )
        self.assertEqual(r.status_code, 404)

    @patch("app.routers.n8n_tools.resolve_tenant_id_for_n8n", return_value=FAKE_TENANT)
    @patch("app.routers.n8n_tools.find_crm_client_row_by_phone", return_value=None)
    def test_client_by_phone_not_found(self, _mock_find, _mock_tid):
        r = self.client.get(
            "/api/n8n/tools/client-by-phone",
            params={"instance_token": "tok", "phone": "5541999999999@s.whatsapp.net"},
            headers={"X-CRM-API-Key": "ignored"},
        )
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertFalse(body["found"])

    @patch("app.routers.n8n_tools.resolve_tenant_id_for_n8n", return_value=FAKE_TENANT)
    @patch("app.routers.n8n_tools.find_crm_client_row_by_phone", return_value=CLIENT_ROW_PJ)
    def test_client_by_phone_found_pj(self, _mock_find, _mock_tid):
        r = self.client.get(
            "/api/n8n/tools/client-by-phone",
            params={"instance_token": "tok", "phone": "554137984741@s.whatsapp.net"},
            headers={"X-CRM-API-Key": "ignored"},
        )
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertTrue(body["found"])
        self.assertEqual(body["display_name"], "WBT Solutions")
        self.assertEqual(body["cnpj_formatted"], "47.992.051/0001-00")

    @patch("app.routers.n8n_tools.resolve_tenant_id_for_n8n", return_value=FAKE_TENANT)
    @patch("app.routers.n8n_tools.find_crm_client_row_by_phone", return_value=None)
    def test_last_order_client_missing(self, _mock_find, _mock_tid):
        r = self.client.get(
            "/api/n8n/tools/last-order-by-phone",
            params={"instance_token": "tok", "phone": "5541999999999@s.whatsapp.net"},
            headers={"X-CRM-API-Key": "ignored"},
        )
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertFalse(body["client_found"])
        self.assertIn("message_last", body)
        self.assertIn("cadastro", body["message_last"].lower())

    @patch("app.routers.n8n_tools.resolve_tenant_id_for_n8n", return_value=FAKE_TENANT)
    @patch("app.routers.n8n_tools.find_crm_client_row_by_phone", return_value=CLIENT_ROW_PJ)
    @patch("app.routers.n8n_tools.fetch_last_order_for_client", return_value=ORDER_ROW)
    def test_last_order_found(self, _mock_fetch, _mock_find, _mock_tid):
        r = self.client.get(
            "/api/n8n/tools/last-order-by-phone",
            params={"instance_token": "tok", "phone": "554137984741@s.whatsapp.net"},
            headers={"X-CRM-API-Key": "ignored"},
        )
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertTrue(body["client_found"])
        self.assertTrue(body["has_previous_order"])
        o = body["order"]
        self.assertEqual(o["product_summary"], "2x Geleia de Amora")
        self.assertEqual(o["id"], "order-1")
        self.assertEqual(o["tenant_id"], FAKE_TENANT)
        self.assertEqual(o["client_name"], "Aurora")
        self.assertEqual(o["client_company"], "WBT Solutions")
        self.assertEqual(o["notes"], "Entregar na recepção")
        self.assertEqual(o["subtotal"], 40.0)
        self.assertEqual(o["discount_total"], 4.0)
        self.assertEqual(o["total"], 36.0)
        self.assertEqual(o["stage"], "pedido_feito")
        self.assertEqual(o["applied_promotions_json"], {"code": "VIP10", "pct": 10})
        self.assertEqual(o["products_json"], [{"sku": "GEL-AMO", "qty": 2}])
        self.assertEqual(o["payment_status"], "pago")
        self.assertEqual(o["payment_method"], "PIX")
        ml = body["message_last"]
        self.assertIn("Seu último pedido foi:", ml)
        self.assertIn("2x Geleia de Amora", ml)
        self.assertIn("R$", ml)
        self.assertIn("36,00", ml)
        self.assertIn("Gostaria de repetir", ml)

    def test_last_order_message_last_no_order(self):
        from app.services.n8n_agent_tools import build_last_order_tool_payload

        out = build_last_order_tool_payload(None)
        self.assertFalse(out["has_previous_order"])
        self.assertIn("pedido anterior", out["message_last"].lower())

    def test_format_last_order_client_message(self):
        from app.services.n8n_agent_tools import format_last_order_client_message

        msg = format_last_order_client_message(
            {
                "product_summary": "4x Geleia de Figo",
                "total": 72,
                "created_at": "2026-04-07T00:11:09.945359+00:00",
            }
        )
        self.assertIn("4x Geleia de Figo", msg)
        self.assertIn("72,00", msg)
        self.assertRegex(msg, r"Data: \d{2}/\d{2}/2026")

    def test_fetch_last_order_for_client_excludes_canceled(self):
        """AC1: query chain must filter out payment_status = cancelado."""
        from app.services.n8n_agent_tools import fetch_last_order_for_client

        mock_sb = MagicMock()
        chain = MagicMock()
        mock_sb.table.return_value = chain
        for name in ("select", "eq", "neq", "order", "limit", "in_"):
            getattr(chain, name).return_value = chain
        exec_result = MagicMock()
        exec_result.data = [ORDER_ROW]
        chain.execute.return_value = exec_result

        out = fetch_last_order_for_client(
            mock_sb, tenant_id=FAKE_TENANT, client_id=FAKE_CLIENT_ID
        )
        self.assertIsNotNone(out)
        self.assertEqual(out["id"], "order-1")
        chain.neq.assert_called_with("payment_status", "cancelado")

    def test_tools_require_api_key(self):
        app.dependency_overrides.pop(verify_n8n_api_key, None)
        r = self.client.get(
            "/api/n8n/tools/client-by-phone",
            params={"instance_token": "tok", "phone": "554137984741@s.whatsapp.net"},
        )
        self.assertIn(r.status_code, (401, 503))

    @patch("app.routers.n8n_tools.resolve_inbox_row_for_n8n", return_value=None)
    def test_lead_context_inbox_missing(self, _mock_inbox):
        r = self.client.get(
            "/api/n8n/tools/lead-context",
            params={"instance_token": "bad", "phone": "554197889864@s.whatsapp.net"},
            headers={"X-CRM-API-Key": "ignored"},
        )
        self.assertEqual(r.status_code, 404)

    @patch(
        "app.routers.n8n_tools.resolve_inbox_row_for_n8n",
        return_value={"id": "inbox-1", "tenant_id": FAKE_TENANT, "funnel_id": "f1"},
    )
    @patch("app.routers.n8n_tools.find_lead_by_whatsapp_chat", return_value=None)
    def test_lead_context_no_lead(self, _mock_lead, _mock_inbox):
        r = self.client.get(
            "/api/n8n/tools/lead-context",
            params={"instance_token": "tok", "phone": "554197889864@s.whatsapp.net"},
            headers={"X-CRM-API-Key": "ignored"},
        )
        self.assertEqual(r.status_code, 200)
        self.assertFalse(r.json()["found"])
        self.assertEqual(r.json()["route_hint"], "no_lead")

    @patch(
        "app.routers.n8n_tools.resolve_inbox_row_for_n8n",
        return_value={"id": "inbox-1", "tenant_id": FAKE_TENANT, "funnel_id": "f1"},
    )
    @patch(
        "app.routers.n8n_tools.find_lead_by_whatsapp_chat",
        return_value={
            "id": "lead-x",
            "stage": "B2B",
            "client_id": FAKE_CLIENT_ID,
            "contact_name": "Aurora",
            "whatsapp_chat_id": "554197889864@s.whatsapp.net",
        },
    )
    def test_lead_context_b2b(self, _mock_lead, _mock_inbox):
        r = self.client.get(
            "/api/n8n/tools/lead-context",
            params={"instance_token": "tok", "phone": "554197889864@s.whatsapp.net"},
            headers={"X-CRM-API-Key": "ignored"},
        )
        self.assertEqual(r.status_code, 200)
        b = r.json()
        self.assertTrue(b["found"])
        self.assertEqual(b["route_hint"], "b2b")
        self.assertEqual(b["stage"], "B2B")

    @patch(
        "app.routers.n8n_tools.resolve_inbox_row_for_n8n",
        return_value={"id": "inbox-1", "tenant_id": FAKE_TENANT, "funnel_id": "f1"},
    )
    @patch(
        "app.routers.n8n_tools.find_lead_by_whatsapp_chat",
        return_value={
            "id": "lead-final",
            "stage": "FINALIZADO",
            "client_id": FAKE_CLIENT_ID,
            "contact_name": "Aurora",
            "whatsapp_chat_id": "554197889864@s.whatsapp.net",
        },
    )
    def test_lead_context_finalizado(self, _mock_lead, _mock_inbox):
        r = self.client.get(
            "/api/n8n/tools/lead-context",
            params={"instance_token": "tok", "phone": "554197889864@s.whatsapp.net"},
            headers={"X-CRM-API-Key": "ignored"},
        )
        self.assertEqual(r.status_code, 200)
        b = r.json()
        self.assertTrue(b["found"])
        self.assertEqual(b["route_hint"], "finalizado")
        self.assertEqual(b["stage"], "FINALIZADO")


if __name__ == "__main__":
    unittest.main()
