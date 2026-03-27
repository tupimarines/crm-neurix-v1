"""Bugfix Sprint D/B-05: escopo de Kanban por organização."""

import unittest
from unittest.mock import MagicMock, patch

from fastapi import HTTPException

from app.authz import compute_effective_role
from app.routers.leads import _resolve_kanban_scope


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


if __name__ == "__main__":
    unittest.main()
