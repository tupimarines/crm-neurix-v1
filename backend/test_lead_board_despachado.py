"""Regra Despachado → Finalizado no funil principal + helpers de nome de etapa."""

from __future__ import annotations

import unittest
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from app.dependencies import get_current_user, get_supabase
from app.authz import compute_effective_role, get_effective_role
from app.main import app
from app.services.lead_board import (
    find_stage_row_by_casefold_name,
    is_despachado_destination_name,
)


class TestDespachadoNameMatching(unittest.TestCase):
    def test_exact(self):
        self.assertTrue(is_despachado_destination_name("Despachado"))
        self.assertTrue(is_despachado_destination_name("  despachado  "))

    def test_truncated_prefix(self):
        self.assertTrue(is_despachado_destination_name("Despacha"))
        self.assertTrue(is_despachado_destination_name("despachad"))

    def test_not_despachado(self):
        self.assertFalse(is_despachado_destination_name("Enviado"))
        self.assertFalse(is_despachado_destination_name("De"))
        self.assertFalse(is_despachado_destination_name(""))

    def test_find_finalizado_row(self):
        stages = [
            {"id": "a", "name": "Novo"},
            {"id": "b", "name": "FINALIZADO"},
        ]
        r = find_stage_row_by_casefold_name(stages, "finalizado")
        self.assertIsNotNone(r)
        self.assertEqual(r["id"], "b")


class _FakeUser:
    __slots__ = ("id",)

    def __init__(self, uid: str):
        self.id = uid


class _FakeExec:
    __slots__ = ("data",)

    def __init__(self, data):
        self.data = data


class _SbChain:
    def __init__(self, pop_fn):
        self._pop = pop_fn

    def select(self, *a, **kw):
        return self

    def update(self, *a, **kw):
        return self

    def upsert(self, *a, **kw):
        return self

    def eq(self, *a, **kw):
        return self

    def in_(self, *a, **kw):
        return self

    def limit(self, *a, **kw):
        return self

    def execute(self):
        return self._pop()


def _make_queue_supabase(queue: list):
    def pop():
        if not queue:
            raise RuntimeError("fila de execute esgotada")
        item = queue.pop(0)
        if isinstance(item, BaseException):
            raise item
        return item

    sb = MagicMock()
    sb.table.return_value = _SbChain(pop)
    return sb


LOG_STAGES = [
    {"id": "st-a", "name": "A", "order_position": 0},
    {"id": "st-desp", "name": "Despachado", "order_position": 1},
]
MAIN_STAGES = [
    {"id": "st-novo", "name": "Novo", "order_position": 0},
    {"id": "st-fin", "name": "FINALIZADO", "order_position": 10},
]
MAIN_NO_FINALIZADO = [{"id": "st-novo", "name": "Novo", "order_position": 0}]


def _fetch_stages_side_effect(supabase, data_tenant_id, funnel_id):
    if funnel_id == "funnel-log":
        return LOG_STAGES
    return MAIN_STAGES


class TestMoveLeadStageDespachadoSync(unittest.TestCase):
    def tearDown(self):
        app.dependency_overrides.clear()

    def _eff_tenant_admin(self, uid: str = "tenant-1"):
        return compute_effective_role(
            uid,
            {"is_superadmin": False, "role": "admin", "organization_id": None},
            [],
        )

    @patch("app.routers.leads._spawn_fresh_lead_after_finalized")
    @patch("app.routers.leads.apply_destination_mirror")
    @patch("app.routers.leads.fetch_stage_automation_for_source_stage", return_value=None)
    @patch("app.routers.leads.insert_lead_activity")
    @patch("app.routers.leads.upsert_pipeline_position")
    @patch("app.routers.leads._default_funnel_id_for_tenant", return_value="funnel-main")
    @patch(
        "app.routers.leads._fetch_pipeline_stages_for_funnel",
        side_effect=_fetch_stages_side_effect,
    )
    @patch("app.routers.leads._resolve_kanban_scope", return_value=("tenant-1", "funnel-log"))
    def test_mirror_despachado_syncs_primary_finalizado(
        self,
        _resolve,
        _fetch,
        _default,
        mock_upsert,
        mock_act,
        mock_auto,
        mock_mirror,
        mock_spawn,
    ):
        lead_row = {
            "id": "lead-1",
            "tenant_id": "tenant-1",
            "funnel_id": "funnel-main",
            "stage": "Novo",
            "whatsapp_chat_id": None,
            "inbox_id": None,
            "client_id": None,
            "company_name": "X",
            "contact_name": "Y",
            "phone": "1",
            "value": 0.0,
            "priority": None,
            "notes": None,
            "products_json": [],
            "stock_reserved_json": None,
            "purchase_history_json": [],
            "created_at": "2026-01-01T00:00:00+00:00",
            "updated_at": "2026-01-01T00:00:00+00:00",
        }
        refreshed = {**lead_row, "stage": "FINALIZADO"}
        # upsert_pipeline_position, insert_lead_activity e automação estão mockados — sem .execute() extra.
        queue = [
            _FakeExec([lead_row]),
            _FakeExec([{"board_owner_user_id": "tenant-1", "stage_id": "st-novo"}]),
            _FakeExec([refreshed]),
            _FakeExec([refreshed]),
        ]
        sb = _make_queue_supabase(queue)

        app.dependency_overrides[get_supabase] = lambda: sb
        app.dependency_overrides[get_current_user] = lambda: _FakeUser("tenant-1")
        app.dependency_overrides[get_effective_role] = lambda: self._eff_tenant_admin("tenant-1")

        client = TestClient(app)
        r = client.patch(
            "/api/leads/lead-1/stage",
            params={"funnel_id": "funnel-log"},
            json={"stage": "Despachado"},
        )
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()["stage"], "FINALIZADO")
        mock_spawn.assert_not_called()
        funnel_ids = [c.kwargs.get("funnel_id") for c in mock_upsert.call_args_list]
        self.assertIn("funnel-log", funnel_ids)
        self.assertIn("funnel-main", funnel_ids)

    @patch("app.routers.leads._default_funnel_id_for_tenant", return_value="funnel-main")
    @patch(
        "app.routers.leads._fetch_pipeline_stages_for_funnel",
        side_effect=lambda supabase, data_tenant_id, funnel_id: (
            LOG_STAGES if funnel_id == "funnel-log" else MAIN_NO_FINALIZADO
        ),
    )
    @patch("app.routers.leads._resolve_kanban_scope", return_value=("tenant-1", "funnel-log"))
    def test_despachado_422_when_main_has_no_finalizado(self, _resolve, _fetch, _default):
        app.dependency_overrides[get_supabase] = lambda: MagicMock()
        app.dependency_overrides[get_current_user] = lambda: _FakeUser("tenant-1")
        app.dependency_overrides[get_effective_role] = lambda: self._eff_tenant_admin("tenant-1")

        client = TestClient(app)
        r = client.patch(
            "/api/leads/lead-1/stage",
            params={"funnel_id": "funnel-log"},
            json={"stage": "Despachado"},
        )
        self.assertEqual(r.status_code, 422, r.text)
        self.assertIn("Finalizado", r.json().get("detail", ""))


if __name__ == "__main__":
    unittest.main()
