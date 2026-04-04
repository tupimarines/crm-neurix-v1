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
    "lead_id": "lead-1",
    "client_id": FAKE_CLIENT_ID,
    "product_summary": "2x Geleia de Amora",
    "products_json": [],
    "total": 36.0,
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
        self.assertFalse(r.json()["client_found"])

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
        self.assertEqual(body["order"]["product_summary"], "2x Geleia de Amora")

    def test_tools_require_api_key(self):
        app.dependency_overrides.pop(verify_n8n_api_key, None)
        r = self.client.get(
            "/api/n8n/tools/client-by-phone",
            params={"instance_token": "tok", "phone": "554137984741@s.whatsapp.net"},
        )
        self.assertIn(r.status_code, (401, 503))


if __name__ == "__main__":
    unittest.main()
