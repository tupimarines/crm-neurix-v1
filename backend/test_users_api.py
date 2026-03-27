"""
Sprint 4 — testes mínimos: criação de usuário (Auth Admin mock) e leitura de perfil.
"""

import unittest
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from app.authz import compute_effective_role, get_effective_role
from app.dependencies import get_current_user, get_supabase
from app.main import app


class FakeUser:
    def __init__(self, uid: str = "admin-1"):
        self.id = uid


class FakeAuthAdmin:
    def __init__(self, new_uid: str = "new-user-uuid"):
        self._id = new_uid

    def create_user(self, _attrs):
        u = MagicMock()
        u.id = self._id
        return MagicMock(user=u)

    def get_user_by_id(self, _uid):
        u = MagicMock()
        u.email = "read@example.com"
        return MagicMock(user=u)

    def update_user_by_id(self, _uid, _attrs):
        return MagicMock()


class TestUsersApi(unittest.TestCase):
    def tearDown(self):
        app.dependency_overrides.clear()

    def test_create_read_only_requires_auth(self):
        client = TestClient(app)
        r = client.post(
            "/api/users/",
            json={
                "organization_id": "org-1",
                "email": "a@b.com",
                "password": "secret123",
                "full_name": "A",
                "role": "read_only",
                "assigned_funnel_id": "11111111-1111-1111-1111-111111111111",
            },
        )
        self.assertIn(r.status_code, (401, 403))

    def test_create_read_only_happy_path_mocked(self):
        # Superadmin dispensa membership mock para permissão de criação
        eff = compute_effective_role(
            "admin-1",
            {"is_superadmin": True, "role": "admin", "organization_id": None},
            [],
        )
        app.dependency_overrides[get_effective_role] = lambda: eff
        app.dependency_overrides[get_current_user] = lambda: FakeUser("admin-1")

        mock_sb = MagicMock()
        mock_sb.auth.admin = FakeAuthAdmin("new-uuid-1")

        def table_side2(name: str):
            t = MagicMock()
            if name == "organizations":
                t.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
                    data=[{"id": "org-x"}]
                )
            elif name == "profiles":
                t.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
                    data=[
                        {
                            "id": "new-uuid-1",
                            "full_name": "Leitor",
                            "company_name": "Emp",
                            "phones": ["+5511999990000"],
                            "created_at": "2026-01-01T00:00:00+00:00",
                        }
                    ]
                )
                t.update.return_value.eq.return_value.execute.return_value = MagicMock(data=[{}])
            elif name == "organization_members":
                t.insert.return_value.execute.return_value = MagicMock(
                    data=[
                        {
                            "organization_id": "org-x",
                            "user_id": "new-uuid-1",
                            "role": "read_only",
                            "assigned_funnel_id": "11111111-1111-1111-1111-111111111111",
                            "created_at": "2026-01-01T00:00:00+00:00",
                        }
                    ]
                )
            return t

        mock_sb.table.side_effect = table_side2
        app.dependency_overrides[get_supabase] = lambda: mock_sb

        client = TestClient(app)
        with patch("app.routers.users.assert_funnel_assignable_to_org", lambda _s, _o, _f: None):
            r = client.post(
                "/api/users/",
                json={
                    "organization_id": "org-x",
                    "email": "read@example.com",
                    "password": "secret123",
                    "full_name": "Leitor",
                    "company_name": "Empresa",
                    "phones": ["+5511999990000"],
                    "role": "read_only",
                    "assigned_funnel_id": "11111111-1111-1111-1111-111111111111",
                },
            )
        self.assertEqual(r.status_code, 201, r.text)
        body = r.json()
        self.assertEqual(body["role"], "read_only")
        self.assertEqual(body["assigned_funnel_id"], "11111111-1111-1111-1111-111111111111")
        self.assertEqual(body["phones"], ["+5511999990000"])

    def test_get_user_detail_mocked(self):
        eff = compute_effective_role(
            "u1",
            {"is_superadmin": False, "role": "admin", "organization_id": "org-x"},
            [{"organization_id": "org-x", "role": "admin"}],
        )
        app.dependency_overrides[get_effective_role] = lambda: eff
        app.dependency_overrides[get_current_user] = lambda: FakeUser("u1")

        mock_sb = MagicMock()
        mock_sb.auth.admin = FakeAuthAdmin()

        prof = MagicMock()
        prof.data = [
            {
                "id": "u2",
                "full_name": "X",
                "company_name": "Y",
                "phones": ["+551111"],
            }
        ]
        om = MagicMock()
        om.data = [
            {"organization_id": "org-x", "role": "read_only", "assigned_funnel_id": "funnel-1"},
        ]

        def table_side(name: str):
            t = MagicMock()
            if name == "profiles":
                t.select.return_value.eq.return_value.limit.return_value.execute.return_value = prof
            elif name == "organization_members":
                t.select.return_value.eq.return_value.execute.return_value = om
            return t

        mock_sb.table.side_effect = table_side
        app.dependency_overrides[get_supabase] = lambda: mock_sb

        client = TestClient(app)
        r = client.get("/api/users/u2")
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertEqual(data["phones"], ["+551111"])
        self.assertEqual(len(data["memberships"]), 1)
        self.assertEqual(data["memberships"][0]["assigned_funnel_id"], "funnel-1")


if __name__ == "__main__":
    unittest.main()
