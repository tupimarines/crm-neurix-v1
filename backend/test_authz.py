"""Testes de RBAC: compute_effective_role e probes HTTP (override de Depends)."""

import unittest

from fastapi.testclient import TestClient

from app.authz import compute_effective_role, get_effective_role
from app.dependencies import get_current_user, get_supabase
from app.main import app


class TestComputeEffectiveRole(unittest.TestCase):
    def test_superadmin_flag(self):
        eff = compute_effective_role(
            "u1",
            {"is_superadmin": True, "role": "admin", "organization_id": None},
            [],
        )
        self.assertTrue(eff.is_superadmin)
        self.assertTrue(eff.is_org_admin)

    def test_org_admin_via_membership(self):
        eff = compute_effective_role(
            "u1",
            {"is_superadmin": False, "role": "admin", "organization_id": "org-a"},
            [{"organization_id": "org-a", "role": "admin"}],
        )
        self.assertFalse(eff.is_superadmin)
        self.assertTrue(eff.is_org_admin)
        self.assertEqual(eff.org_member_role, "admin")

    def test_read_only_member_not_org_admin(self):
        eff = compute_effective_role(
            "u1",
            {"is_superadmin": False, "role": "admin", "organization_id": "org-a"},
            [{"organization_id": "org-a", "role": "read_only"}],
        )
        self.assertFalse(eff.is_org_admin)
        self.assertTrue(eff.is_read_only)

    def test_read_only_assigned_funnel_id(self):
        eff = compute_effective_role(
            "u1",
            {"is_superadmin": False, "role": "admin", "organization_id": "org-a"},
            [{"organization_id": "org-a", "role": "read_only", "assigned_funnel_id": "funnel-uuid-1"}],
        )
        self.assertEqual(eff.assigned_funnel_id, "funnel-uuid-1")
        self.assertTrue(eff.is_read_only)

    def test_legacy_tenant_admin_without_membership(self):
        eff = compute_effective_role(
            "u1",
            {"is_superadmin": False, "role": "admin", "organization_id": None},
            [],
        )
        self.assertTrue(eff.is_org_admin)

    def test_prefers_membership_matching_profile_org(self):
        eff = compute_effective_role(
            "u1",
            {"is_superadmin": False, "role": "admin", "organization_id": "org-b"},
            [
                {"organization_id": "org-a", "role": "admin"},
                {"organization_id": "org-b", "role": "read_only"},
            ],
        )
        self.assertEqual(eff.org_member_role, "read_only")
        self.assertFalse(eff.is_org_admin)

    def test_effective_organization_id_falls_back_to_membership(self):
        eff = compute_effective_role(
            "u1",
            {"is_superadmin": False, "role": "admin", "organization_id": None},
            [{"organization_id": "org-a", "role": "admin"}],
        )
        self.assertEqual(eff.effective_organization_id, "org-a")


class TestRbacProbesHttp(unittest.TestCase):
    def tearDown(self):
        app.dependency_overrides.clear()

    def test_superadmin_probe_200(self):
        eff = compute_effective_role(
            "u1",
            {"is_superadmin": True, "role": "admin", "organization_id": None},
            [],
        )
        app.dependency_overrides[get_effective_role] = lambda: eff
        client = TestClient(app)
        r = client.get("/api/auth/rbac/superadmin")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json().get("scope"), "superadmin")

    def test_superadmin_probe_403(self):
        eff = compute_effective_role(
            "u1",
            {"is_superadmin": False, "role": "admin", "organization_id": None},
            [],
        )
        app.dependency_overrides[get_effective_role] = lambda: eff
        client = TestClient(app)
        r = client.get("/api/auth/rbac/superadmin")
        self.assertEqual(r.status_code, 403)

    def test_org_admin_probe_403_read_only(self):
        eff = compute_effective_role(
            "u1",
            {"is_superadmin": False, "role": "admin", "organization_id": "o1"},
            [{"organization_id": "o1", "role": "read_only"}],
        )
        self.assertFalse(eff.is_org_admin)
        app.dependency_overrides[get_effective_role] = lambda: eff
        client = TestClient(app)
        r = client.get("/api/auth/rbac/org-admin")
        self.assertEqual(r.status_code, 403)


class _FakeUser:
    id = "00000000-0000-0000-0000-0000000000aa"


async def _fake_current_user():
    return _FakeUser()


class _FakeAuthMeUser:
    id = "00000000-0000-0000-0000-0000000000bb"
    email = "member@example.com"
    role = "authenticated"
    user_metadata = {}


async def _fake_auth_me_user():
    return _FakeAuthMeUser()


class _FakeSupabaseResponse:
    def __init__(self, data):
        self.data = data


class _FakeSupabaseQuery:
    def __init__(self, data):
        self._data = data

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, *_args, **_kwargs):
        return self

    def limit(self, *_args, **_kwargs):
        return self

    def execute(self):
        return _FakeSupabaseResponse(self._data)


class _FakeSupabase:
    def __init__(self, tables):
        self._tables = tables

    def table(self, name):
        return _FakeSupabaseQuery(self._tables.get(name, []))


class TestReadOnlyBlocksMutations(unittest.TestCase):
    """S12-T2 / AC13 / AC4: read_only não altera produtos, leads (PATCH), promoções — 403 antes do DB."""

    def tearDown(self):
        app.dependency_overrides.clear()

    def test_read_only_patch_product_403(self):
        eff = compute_effective_role(
            "u1",
            {"is_superadmin": False, "role": "admin", "organization_id": "o1"},
            [{"organization_id": "o1", "role": "read_only"}],
        )
        app.dependency_overrides[get_effective_role] = lambda: eff
        app.dependency_overrides[get_current_user] = _fake_current_user
        client = TestClient(app)
        r = client.patch(
            "/api/products/00000000-0000-0000-0000-000000000001",
            json={"name": "x"},
        )
        self.assertEqual(r.status_code, 403)

    def test_read_only_patch_lead_with_products_json_403(self):
        eff = compute_effective_role(
            "u1",
            {"is_superadmin": False, "role": "admin", "organization_id": "o1"},
            [{"organization_id": "o1", "role": "read_only"}],
        )
        app.dependency_overrides[get_effective_role] = lambda: eff
        app.dependency_overrides[get_current_user] = _fake_current_user
        client = TestClient(app)
        r = client.patch(
            "/api/leads/00000000-0000-0000-0000-000000000002",
            json={"products_json": [{"id": "p1", "quantity": 1}]},
        )
        self.assertEqual(r.status_code, 403)

    def test_read_only_post_promotion_403(self):
        eff = compute_effective_role(
            "u1",
            {"is_superadmin": False, "role": "admin", "organization_id": "o1"},
            [{"organization_id": "o1", "role": "read_only"}],
        )
        app.dependency_overrides[get_effective_role] = lambda: eff
        app.dependency_overrides[get_current_user] = _fake_current_user
        client = TestClient(app)
        r = client.post(
            "/api/promotions/",
            json={
                "name": "x",
                "slug": "x-slug-test",
                "discount_type": "percent",
                "discount_value": 10,
                "starts_at": "2026-01-01T00:00:00Z",
                "product_ids": [],
            },
        )
        self.assertEqual(r.status_code, 403)

    def test_org_admin_patch_product_not_forbidden_by_rbac(self):
        eff = compute_effective_role(
            "u1",
            {"is_superadmin": False, "role": "admin", "organization_id": None},
            [],
        )
        app.dependency_overrides[get_effective_role] = lambda: eff
        app.dependency_overrides[get_current_user] = _fake_current_user
        client = TestClient(app)
        r = client.patch(
            "/api/products/00000000-0000-0000-0000-000000000001",
            json={"name": "x"},
        )
        self.assertNotEqual(r.status_code, 403)


class TestAuthMeEndpoint(unittest.TestCase):
    def tearDown(self):
        app.dependency_overrides.clear()

    def test_me_uses_membership_org_when_profile_org_is_null(self):
        app.dependency_overrides[get_current_user] = _fake_auth_me_user
        app.dependency_overrides[get_supabase] = lambda: _FakeSupabase(
            {
                "profiles": [
                    {
                        "id": _FakeAuthMeUser.id,
                        "full_name": "Member Example",
                        "is_superadmin": False,
                        "organization_id": None,
                        "role": "admin",
                    }
                ],
                "organization_members": [
                    {
                        "organization_id": "org-membership",
                        "role": "admin",
                        "assigned_funnel_id": None,
                    }
                ],
            }
        )
        client = TestClient(app)
        r = client.get("/api/auth/me")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json().get("organization_id"), "org-membership")


if __name__ == "__main__":
    unittest.main()
