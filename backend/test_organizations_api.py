"""
Sprint 3 — smoke / pytest mínimo para API de organizações.

Smoke manual (curl) — substituir TOKEN e BASE_URL após login em /api/auth/login:

  set BASE_URL=http://localhost:8000
  set TOKEN=eyJhbGciOi...

  curl -sS -H "Authorization: Bearer %TOKEN%" "%BASE_URL%/api/organizations/"

  curl -sS -X POST -H "Authorization: Bearer %TOKEN%" -H "Content-Type: application/json" ^
    -d "{\"name\":\"Minha Org QA\"}" "%BASE_URL%/api/organizations/"

POST de organização exige superadmin. GET lista todas (superadmin) ou só orgs em que o usuário é membro.
"""

import unittest
from unittest.mock import MagicMock

from fastapi.testclient import TestClient

from app.authz import compute_effective_role, get_effective_role
from app.dependencies import get_current_user, get_supabase
from app.main import app


class FakeUser:
    def __init__(self, uid: str = "user-1"):
        self.id = uid


class TestOrganizationsApi(unittest.TestCase):
    def tearDown(self):
        app.dependency_overrides.clear()

    def test_list_requires_auth(self):
        client = TestClient(app)
        r = client.get("/api/organizations/")
        self.assertIn(r.status_code, (401, 403))

    def test_superadmin_list_returns_mocked_rows(self):
        eff = compute_effective_role(
            "u1",
            {"is_superadmin": True, "role": "admin", "organization_id": None},
            [],
        )
        app.dependency_overrides[get_effective_role] = lambda: eff
        app.dependency_overrides[get_current_user] = lambda: FakeUser("u1")

        mock_sb = MagicMock()
        exec_orgs = MagicMock()
        exec_orgs.data = [
            {
                "id": "11111111-1111-1111-1111-111111111111",
                "name": "Org A",
                "created_at": "2026-01-01T00:00:00+00:00",
                "updated_at": "2026-01-01T00:00:00+00:00",
            }
        ]
        mock_sb.table.return_value.select.return_value.order.return_value.execute.return_value = exec_orgs
        app.dependency_overrides[get_supabase] = lambda: mock_sb

        client = TestClient(app)
        r = client.get("/api/organizations/")
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertEqual(len(body), 1)
        self.assertEqual(body[0]["name"], "Org A")

    def test_read_only_cannot_patch_org(self):
        eff = compute_effective_role(
            "u1",
            {"is_superadmin": False, "role": "admin", "organization_id": "org-x"},
            [{"organization_id": "org-x", "role": "read_only"}],
        )
        app.dependency_overrides[get_effective_role] = lambda: eff
        app.dependency_overrides[get_current_user] = lambda: FakeUser("u1")

        mock_exec = MagicMock()
        mock_exec.data = [
            {
                "id": "m1",
                "organization_id": "org-x",
                "user_id": "u1",
                "role": "read_only",
                "assigned_funnel_id": None,
                "created_at": "2026-01-01T00:00:00+00:00",
            }
        ]
        mock_limit = MagicMock()
        mock_limit.execute.return_value = mock_exec
        mock_eq_user = MagicMock()
        mock_eq_user.limit.return_value = mock_limit
        mock_eq_org = MagicMock()
        mock_eq_org.eq.return_value = mock_eq_user
        mock_select = MagicMock()
        mock_select.eq.return_value = mock_eq_org
        mock_om = MagicMock()
        mock_om.select.return_value = mock_select

        def table_side(name: str):
            if name == "organization_members":
                return mock_om
            return MagicMock()

        mock_sb = MagicMock()
        mock_sb.table.side_effect = table_side
        app.dependency_overrides[get_supabase] = lambda: mock_sb

        client = TestClient(app)
        r = client.patch(
            "/api/organizations/org-x",
            json={"name": "Novo"},
        )
        self.assertEqual(r.status_code, 403)


if __name__ == "__main__":
    unittest.main()
