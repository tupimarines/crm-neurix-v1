"""Bugfix Sprint D/B-05: escopo de Kanban por organização."""

import unittest
from unittest.mock import MagicMock, patch

from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.authz import compute_effective_role, get_effective_role
from app.dependencies import get_current_user, get_supabase
from app.main import app
from app.routers.leads import _resolve_kanban_scope, lead_row_to_response_safe


class FakeUser:
    def __init__(self, uid: str = "tenant-kanban-test"):
        self.id = uid


class _FakeExec:
    def __init__(self, data):
        self.data = data


class TestKanbanScope(unittest.TestCase):
    def test_org_admin_without_own_funnel_falls_back_to_org_funnel(self):
        eff = compute_effective_role(
            "admin-1",
            {"is_superadmin": False, "role": "admin", "organization_id": None},
            [{"organization_id": "org-1", "role": "admin"}],
        )
        sb = MagicMock()

        with (
            patch("app.routers.leads._default_funnel_id_for_tenant") as default_for_tenant,
            patch("app.routers.leads.list_funnels_for_organization") as list_for_org,
        ):
            default_for_tenant.side_effect = HTTPException(status_code=404, detail="missing")
            list_for_org.return_value = [
                {
                    "id": "f-default",
                    "tenant_id": "admin-root",
                    "name": "Default",
                    "created_at": "2026-03-27T00:00:00+00:00",
                }
            ]

            tenant_id, funnel_id = _resolve_kanban_scope(sb, "admin-1", eff, None)

        self.assertEqual(tenant_id, "admin-root")
        self.assertEqual(funnel_id, "f-default")

    def test_org_admin_can_open_org_funnel_from_other_admin(self):
        eff = compute_effective_role(
            "admin-1",
            {"is_superadmin": False, "role": "admin", "organization_id": None},
            [{"organization_id": "org-1", "role": "admin"}],
        )
        sb = MagicMock()
        query = MagicMock()
        query.eq.return_value.limit.return_value.execute.return_value = _FakeExec(
            [{"id": "f-shared", "tenant_id": "admin-root"}]
        )
        sb.table.return_value.select.return_value = query

        with patch("app.routers.leads.funnel_ids_for_organization", return_value={"f-shared"}):
            tenant_id, funnel_id = _resolve_kanban_scope(sb, "admin-1", eff, "f-shared")

        self.assertEqual(tenant_id, "admin-root")
        self.assertEqual(funnel_id, "f-shared")


class TestLeadRowToResponseSafe(unittest.TestCase):
    def _base_row(self) -> dict:
        return {
            "id": "lead-1",
            "tenant_id": "t1",
            "created_at": "2026-01-01T12:00:00+00:00",
            "updated_at": "2026-01-02T12:00:00+00:00",
            "company_name": "Acme",
            "contact_name": "João",
            "stage": "Novo",
            "funnel_id": "f1",
        }

    def test_unmatched_products_json_and_invalid_priority_still_parse(self):
        row = self._base_row()
        row["priority"] = "super_urgente"
        row["products_json"] = [
            {"unmatched": True, "name": "X", "id": "", "product_id": "", "quantity": 1},
            "not-a-dict",
        ]
        row["stock_reserved_json"] = {"oops": "not a list"}
        lr = lead_row_to_response_safe(row)
        self.assertEqual(lr.id, "lead-1")
        self.assertIsNone(lr.priority)
        self.assertEqual(len(lr.products_json or []), 1)
        self.assertEqual((lr.stock_reserved_json or []), [])

    def test_empty_names_and_negative_value_sanitized(self):
        row = self._base_row()
        row["company_name"] = "   "
        row["contact_name"] = ""
        row["value"] = -10
        lr = lead_row_to_response_safe(row)
        self.assertTrue(lr.company_name.startswith("("))
        self.assertTrue(lr.contact_name.startswith("("))
        self.assertEqual(lr.value, 0.0)


class TestKanbanBoardHttpResilience(unittest.TestCase):
    """Task 5 tech-spec: GET /api/leads/kanban com lead legado / products_json problemático → 200."""

    def tearDown(self):
        app.dependency_overrides.clear()

    @patch("app.routers.leads.build_pos_by_lead", return_value={})
    @patch("app.routers.leads.merge_kanban_lead_rows", side_effect=lambda **kw: kw["primary_rows"])
    @patch("app.routers.leads._fetch_leads_for_funnel")
    @patch("app.routers.leads._fetch_pipeline_stages_for_funnel")
    @patch("app.routers.leads._resolve_kanban_scope", return_value=("tenant-x", "funnel-x"))
    def test_get_kanban_200_with_unmatched_only_products_json(
        self,
        _mock_scope,
        mock_stages,
        mock_leads,
        _mock_merge,
        _mock_pos,
    ):
        mock_stages.return_value = [
            {"name": "Novo", "id": "stage-1", "version": 1, "is_conversion": False},
        ]
        mock_leads.return_value = [
            {
                "id": "lead-unmatched",
                "tenant_id": "tenant-x",
                "funnel_id": "funnel-x",
                "inbox_id": None,
                "client_id": None,
                "created_at": "2026-01-01T12:00:00+00:00",
                "updated_at": "2026-01-02T12:00:00+00:00",
                "chat_cycle_closed_at": None,
                "company_name": "Cliente X",
                "contact_name": "Maria",
                "stage": "Novo",
                "priority": None,
                "value": 0,
                "notes": "",
                "phone": None,
                "whatsapp_chat_id": "5511999999999@s.whatsapp.net",
                "products_json": [
                    {
                        "unmatched": True,
                        "id": "",
                        "product_id": "",
                        "name": "Produto fantasma",
                        "quantity": 2,
                        "qty": 2,
                        "price": 10.0,
                        "line_total": 20.0,
                    }
                ],
                "stock_reserved_json": [],
                "purchase_history_json": [],
            },
        ]

        eff = compute_effective_role(
            "tenant-x",
            {"is_superadmin": True, "role": "admin", "organization_id": None},
            [],
        )
        app.dependency_overrides[get_effective_role] = lambda: eff
        app.dependency_overrides[get_current_user] = lambda: FakeUser("tenant-x")
        app.dependency_overrides[get_supabase] = lambda: MagicMock()

        client = TestClient(app)
        resp = client.get("/api/leads/kanban")
        self.assertEqual(resp.status_code, 200, msg=resp.text)
        body = resp.json()
        self.assertEqual(body.get("funnel_id"), "funnel-x")
        cols = body.get("columns") or []
        self.assertEqual(len(cols), 1)
        leads_in_col = cols[0].get("leads") or []
        self.assertEqual(len(leads_in_col), 1)
        self.assertEqual(leads_in_col[0]["id"], "lead-unmatched")


if __name__ == "__main__":
    unittest.main()
