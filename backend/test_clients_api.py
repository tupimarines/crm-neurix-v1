"""
Sprint 10 — validação CPF/CNPJ e rotas de clientes CRM.
"""

import uuid

import unittest

from fastapi.testclient import TestClient

from app.authz import compute_effective_role, get_effective_role
from app.dependencies import get_current_user
from app.main import app


class FakeUser:
    def __init__(self, uid: str = "tenant-1"):
        self.id = uid


class TestClientsApi(unittest.TestCase):
    def tearDown(self):
        app.dependency_overrides.clear()

    def test_create_pj_invalid_cnpj_422(self):
        """AC9 / S10-T3 — CNPJ com dígitos verificadores incorretos deve retornar 422."""
        eff = compute_effective_role(
            "admin-1",
            {"is_superadmin": True, "role": "admin", "organization_id": None},
            [],
        )
        app.dependency_overrides[get_effective_role] = lambda: eff
        app.dependency_overrides[get_current_user] = lambda: FakeUser("admin-1")

        client = TestClient(app)
        r = client.post(
            "/api/clients/",
            json={
                "person_type": "PJ",
                "display_name": "Empresa Teste",
                "cnpj": "11.111.111/1111-81",
                "tenant_id": str(uuid.uuid4()),
                "phones": [],
            },
        )
        self.assertEqual(r.status_code, 422)
        body = r.json()
        detail = body.get("detail")
        self.assertIsNotNone(detail)

    def test_pydantic_pj_accepts_masked_valid_cnpj(self):
        """Máscara aceita; valor normalizado em dígitos (AC9)."""
        from app.models.client import CrmClientCreate

        m = CrmClientCreate(
            person_type="PJ",
            display_name="BB S/A",
            cnpj="04.252.011/0001-10",
            tenant_id=str(uuid.uuid4()),
            phones=["11999999999"],
        )
        self.assertEqual(m.cnpj, "04252011000110")

    def test_read_only_cannot_create_403(self):
        eff = compute_effective_role(
            "ro-1",
            {"is_superadmin": False, "role": "admin", "organization_id": "org-1"},
            [
                {
                    "organization_id": "org-1",
                    "role": "read_only",
                    "assigned_funnel_id": str(uuid.uuid4()),
                }
            ],
        )
        app.dependency_overrides[get_effective_role] = lambda: eff
        app.dependency_overrides[get_current_user] = lambda: FakeUser("ro-1")

        client = TestClient(app)
        r = client.post(
            "/api/clients/",
            json={
                "person_type": "PF",
                "display_name": "Fulano",
                "phones": [],
            },
        )
        self.assertEqual(r.status_code, 403)
