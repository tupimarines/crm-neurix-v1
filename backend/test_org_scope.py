"""Sprint 4 — escopo de funis por organização."""

import unittest
from unittest.mock import MagicMock

from app.org_scope import funnel_ids_for_organization


class TestOrgScope(unittest.TestCase):
    def test_funnel_ids_collects_admins_tenants(self):
        sb = MagicMock()
        om = MagicMock()
        om.data = [{"user_id": "a1"}, {"user_id": "a2"}]
        fn = MagicMock()
        fn.data = [{"id": "f1"}, {"id": "f2"}]

        def table(name: str):
            t = MagicMock()
            if name == "organization_members":
                t.select.return_value.eq.return_value.eq.return_value.execute.return_value = om
            elif name == "funnels":
                t.select.return_value.in_.return_value.execute.return_value = fn
            return t

        sb.table.side_effect = table
        ids = funnel_ids_for_organization(sb, "org-1")
        self.assertEqual(ids, {"f1", "f2"})


if __name__ == "__main__":
    unittest.main()
