"""Testes de RBAC: compute_effective_role e probes HTTP (override de Depends)."""

import unittest

from fastapi.testclient import TestClient

from app.authz import compute_effective_role, get_effective_role
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


if __name__ == "__main__":
    unittest.main()
