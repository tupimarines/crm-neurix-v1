"""
Sprint S4 — fluxo FINALIZADO: spawn de lead novo + garantias AC3/AC4/AC6.

Testa `_spawn_fresh_lead_after_finalized` com mocks e PATCH /api/leads/{id}/stage
com fila de respostas Supabase (sem DB real).
"""

from __future__ import annotations

import unittest
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from app.authz import compute_effective_role, get_effective_role
from app.dependencies import get_current_user, get_supabase
from app.main import app
from app.services.lead_finalized_spawn import (
    is_chat_mirror_closed_for_lead,
    spawn_fresh_lead_after_finalized as _spawn_fresh_lead_after_finalized,
)


class _FakeExec:
    __slots__ = ("data",)

    def __init__(self, data):
        self.data = data


class _SbChain:
    """Builder encadeado que delega `execute()` a uma fila."""

    def __init__(self, pop_fn, insert_captures: list | None = None):
        self._pop = pop_fn
        self._insert_captures = insert_captures

    def select(self, *a, **kw):
        return self

    def update(self, *a, **kw):
        return self

    def insert(self, payload=None, *a, **kw):
        if self._insert_captures is not None and payload is not None:
            self._insert_captures.append(payload)
        return self

    def eq(self, *a, **kw):
        return self

    def limit(self, *a, **kw):
        return self

    def in_(self, *a, **kw):
        return self

    def order(self, *a, **kw):
        return self

    def execute(self):
        return self._pop()


def _make_queue_supabase(queue: list, insert_captures: list | None = None):
    """Cada `.execute()` consome o próximo item: _FakeExec ou Exception a lançar."""

    def pop():
        if not queue:
            raise RuntimeError("fila de execute esgotada — ordem de mocks incorreta")
        item = queue.pop(0)
        if isinstance(item, BaseException):
            raise item
        return item

    sb = MagicMock()
    sb.table.return_value = _SbChain(pop, insert_captures=insert_captures)
    return sb


def _lead_row_base():
    return {
        "id": "lead-old",
        "tenant_id": "tenant-1",
        "funnel_id": "funnel-1",
        "inbox_id": "inbox-1",
        "client_id": "client-1",
        "company_name": "Empresa Teste",
        "contact_name": "Contato",
        "phone": "55 11 98888-7777",
        "stage": "Pedido Feito",
        "value": 0.0,
        "priority": None,
        "notes": None,
        "whatsapp_chat_id": "5511988887777@s.whatsapp.net",
        "products_json": [],
        "stock_reserved_json": None,
        "purchase_history_json": [],
        "created_at": "2026-01-01T00:00:00+00:00",
        "updated_at": "2026-01-01T00:00:00+00:00",
    }


_STAGES = [
    {"id": "st-novo", "name": "Novo", "order_position": 0},
    {"id": "st-fin", "name": "FINALIZADO", "order_position": 10},
]


class TestIsChatMirrorClosedForLead(unittest.TestCase):
    def test_closed_without_jid(self):
        self.assertTrue(
            is_chat_mirror_closed_for_lead(
                {"whatsapp_chat_id": None, "stage": "Novo", "chat_cycle_closed_at": None}
            )
        )

    def test_open_active_lead(self):
        self.assertFalse(
            is_chat_mirror_closed_for_lead(
                {
                    "whatsapp_chat_id": "5511@s.whatsapp.net",
                    "stage": "Novo",
                    "chat_cycle_closed_at": None,
                }
            )
        )

    def test_closed_when_finalizado_even_if_jid_present(self):
        self.assertTrue(
            is_chat_mirror_closed_for_lead(
                {
                    "whatsapp_chat_id": "5511@s.whatsapp.net",
                    "stage": "FINALIZADO",
                    "chat_cycle_closed_at": None,
                }
            )
        )

    def test_closed_when_cycle_timestamp_set(self):
        self.assertTrue(
            is_chat_mirror_closed_for_lead(
                {
                    "whatsapp_chat_id": "5511@s.whatsapp.net",
                    "stage": "Proposta",
                    "chat_cycle_closed_at": "2026-01-02T00:00:00+00:00",
                }
            )
        )


class TestSpawnFreshLeadHelper(unittest.TestCase):
    """AC3 / AC4 / AC6 no helper isolado."""

    @patch("app.services.lead_finalized_spawn.upsert_pipeline_position")
    @patch("app.services.lead_finalized_spawn.get_first_stage_slug_for_funnel", return_value="Novo")
    def test_spawn_clears_jid_inserts_clone_and_upserts_ac3(self, _gf, mock_upsert):
        base = _lead_row_base()
        insert_caps: list = []
        sb = _make_queue_supabase(
            [
                _FakeExec([{"id": base["id"]}]),
                _FakeExec(
                    [
                        {
                            "id": "lead-new",
                            "tenant_id": base["tenant_id"],
                            "funnel_id": base["funnel_id"],
                            "whatsapp_chat_id": base["whatsapp_chat_id"],
                            "stage": "Novo",
                        }
                    ]
                ),
            ],
            insert_captures=insert_caps,
        )

        _spawn_fresh_lead_after_finalized(
            supabase=sb,
            original_lead_id=base["id"],
            lead_snapshot=base,
            data_tenant_id=base["tenant_id"],
            resolved_funnel_id=base["funnel_id"],
            stages=_STAGES,
        )

        self.assertEqual(len(insert_caps), 1)
        captured_insert = insert_caps[0]
        self.assertEqual(captured_insert.get("whatsapp_chat_id"), base["whatsapp_chat_id"])
        self.assertEqual(captured_insert.get("inbox_id"), base["inbox_id"])
        self.assertEqual(captured_insert.get("funnel_id"), base["funnel_id"])
        self.assertEqual(captured_insert.get("client_id"), base["client_id"])
        self.assertEqual(captured_insert.get("stage"), "Novo")
        self.assertEqual(captured_insert.get("value"), 0)
        self.assertEqual(captured_insert.get("products_json"), [])
        mock_upsert.assert_called_once()
        kwargs = mock_upsert.call_args.kwargs
        self.assertEqual(kwargs["lead_id"], "lead-new")
        self.assertEqual(kwargs["stage_id"], "st-novo")
        self.assertEqual(kwargs["funnel_id"], base["funnel_id"])
        self.assertEqual(kwargs["board_owner_user_id"], base["tenant_id"])

    def test_spawn_noop_without_whatsapp_ac4(self):
        sb = MagicMock()
        row = _lead_row_base()
        row["whatsapp_chat_id"] = None
        _spawn_fresh_lead_after_finalized(
            supabase=sb,
            original_lead_id=row["id"],
            lead_snapshot=row,
            data_tenant_id=row["tenant_id"],
            resolved_funnel_id=row["funnel_id"],
            stages=_STAGES,
        )
        sb.table.assert_not_called()

    def test_spawn_noop_without_inbox_ac4(self):
        sb = MagicMock()
        row = _lead_row_base()
        row["inbox_id"] = None
        _spawn_fresh_lead_after_finalized(
            supabase=sb,
            original_lead_id=row["id"],
            lead_snapshot=row,
            data_tenant_id=row["tenant_id"],
            resolved_funnel_id=row["funnel_id"],
            stages=_STAGES,
        )
        sb.table.assert_not_called()

    @patch("app.services.lead_finalized_spawn.upsert_pipeline_position")
    @patch("app.services.lead_finalized_spawn.get_first_stage_slug_for_funnel", return_value="Novo")
    def test_spawn_insert_failure_no_raise_ac6(self, _gf, mock_upsert):
        base = _lead_row_base()
        sb = _make_queue_supabase(
            [
                _FakeExec([{"id": base["id"]}]),
                Exception("unique_violation leads_inbox_whatsapp_chat_unique"),
            ]
        )
        _spawn_fresh_lead_after_finalized(
            supabase=sb,
            original_lead_id=base["id"],
            lead_snapshot=base,
            data_tenant_id=base["tenant_id"],
            resolved_funnel_id=base["funnel_id"],
            stages=_STAGES,
        )
        mock_upsert.assert_not_called()


class _FakeUser:
    __slots__ = ("id",)

    def __init__(self, uid: str):
        self.id = uid


class TestMoveLeadStageFinalizedHttp(unittest.TestCase):
    """PATCH stage com overrides; AC4 (não chama spawn) e AC6 (200 após falha no insert)."""

    def tearDown(self):
        app.dependency_overrides.clear()

    def _eff_tenant_admin(self, uid: str = "tenant-1"):
        return compute_effective_role(
            uid,
            {"is_superadmin": False, "role": "admin", "organization_id": None},
            [],
        )

    @patch("app.services.lead_finalized_spawn.upsert_pipeline_position")
    @patch("app.routers.leads.upsert_pipeline_position")
    @patch("app.routers.leads.apply_destination_mirror")
    @patch("app.routers.leads.fetch_stage_automation_for_source_stage", return_value=None)
    @patch("app.routers.leads.insert_lead_activity")
    @patch("app.routers.leads._fetch_pipeline_stages_for_funnel", return_value=_STAGES)
    @patch("app.routers.leads._resolve_kanban_scope", return_value=("tenant-1", "funnel-1"))
    @patch("app.services.lead_finalized_spawn.get_first_stage_slug_for_funnel", return_value="Novo")
    def test_patch_finalizado_primary_spawns_ac3(
        self,
        _gf,
        _resolve,
        _fetch_st,
        _act,
        _auto,
        _mirror,
        _upsert_move,
        _spawn_upsert,
    ):
        lead_row = _lead_row_base()
        refreshed = {**lead_row, "stage": "FINALIZADO", "whatsapp_chat_id": None}
        queue = [
            _FakeExec([lead_row]),
            _FakeExec([]),
            _FakeExec([{**lead_row, "stage": "FINALIZADO"}]),
            _FakeExec([refreshed]),
            _FakeExec([{"id": "lead-new", **{k: refreshed[k] for k in ("tenant_id", "funnel_id")}}]),
            _FakeExec([refreshed]),
        ]
        sb = _make_queue_supabase(queue)

        app.dependency_overrides[get_supabase] = lambda: sb
        app.dependency_overrides[get_current_user] = lambda: _FakeUser("tenant-1")
        app.dependency_overrides[get_effective_role] = lambda: self._eff_tenant_admin("tenant-1")

        client = TestClient(app)
        r = client.patch(
            "/api/leads/lead-old/stage",
            json={"stage": "finalizado"},
        )
        self.assertEqual(r.status_code, 200, r.text)
        body = r.json()
        self.assertEqual(body["id"], "lead-old")
        self.assertEqual(body["stage"], "FINALIZADO")
        self.assertIsNone(body.get("whatsapp_chat_id"))
        self.assertEqual(_upsert_move.call_count, 1)
        _spawn_upsert.assert_called_once()

    @patch("app.routers.leads._spawn_fresh_lead_after_finalized")
    @patch("app.routers.leads.upsert_pipeline_position")
    @patch("app.routers.leads.apply_destination_mirror")
    @patch("app.routers.leads.fetch_stage_automation_for_source_stage", return_value=None)
    @patch("app.routers.leads.insert_lead_activity")
    @patch("app.routers.leads._fetch_pipeline_stages_for_funnel", return_value=_STAGES)
    @patch("app.routers.leads._resolve_kanban_scope", return_value=("tenant-1", "funnel-1"))
    def test_patch_finalizado_mirror_does_not_spawn_ac4(
        self,
        _resolve,
        _fetch_st,
        _act,
        _auto,
        _mirror,
        _upsert_move,
        mock_spawn,
    ):
        lead_row = _lead_row_base()
        lead_row["funnel_id"] = "outro-funil"
        lead_row["whatsapp_chat_id"] = "5511988887777@s.whatsapp.net"
        lead_row["inbox_id"] = "inbox-1"
        refreshed_mirror = {**lead_row, "stage": "FINALIZADO"}
        queue = [
            _FakeExec([lead_row]),
            _FakeExec([{"id": "pos-1", "stage_id": "st-novo"}]),
            _FakeExec([refreshed_mirror]),
        ]
        sb = _make_queue_supabase(queue)

        app.dependency_overrides[get_supabase] = lambda: sb
        app.dependency_overrides[get_current_user] = lambda: _FakeUser("tenant-1")
        app.dependency_overrides[get_effective_role] = lambda: self._eff_tenant_admin("tenant-1")

        client = TestClient(app)
        r = client.patch(
            "/api/leads/lead-old/stage",
            json={"stage": "finalizado"},
        )
        self.assertEqual(r.status_code, 200, r.text)
        mock_spawn.assert_not_called()

    @patch("app.routers.leads.upsert_pipeline_position")
    @patch("app.routers.leads.apply_destination_mirror")
    @patch("app.routers.leads.fetch_stage_automation_for_source_stage", return_value=None)
    @patch("app.routers.leads.insert_lead_activity")
    @patch("app.routers.leads._fetch_pipeline_stages_for_funnel", return_value=_STAGES)
    @patch("app.routers.leads._resolve_kanban_scope", return_value=("tenant-1", "funnel-1"))
    @patch("app.services.lead_finalized_spawn.get_first_stage_slug_for_funnel", return_value="Novo")
    def test_patch_finalizado_insert_fails_still_200_ac6(
        self,
        _gf,
        _resolve,
        _fetch_st,
        _act,
        _auto,
        _mirror,
        _upsert_move,
    ):
        lead_row = _lead_row_base()
        refreshed = {**lead_row, "stage": "FINALIZADO", "whatsapp_chat_id": None}
        queue = [
            _FakeExec([lead_row]),
            _FakeExec([]),
            _FakeExec([{**lead_row, "stage": "FINALIZADO"}]),
            _FakeExec([refreshed]),
            Exception("unique_violation"),
            _FakeExec([refreshed]),
        ]
        sb = _make_queue_supabase(queue)

        app.dependency_overrides[get_supabase] = lambda: sb
        app.dependency_overrides[get_current_user] = lambda: _FakeUser("tenant-1")
        app.dependency_overrides[get_effective_role] = lambda: self._eff_tenant_admin("tenant-1")

        client = TestClient(app)
        r = client.patch(
            "/api/leads/lead-old/stage",
            json={"stage": "finalizado"},
        )
        self.assertEqual(r.status_code, 200, r.text)
        self.assertIsNone(r.json().get("whatsapp_chat_id"))


if __name__ == "__main__":
    unittest.main()
