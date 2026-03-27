"""Normalização de telefone para match em CRM / webhooks (apenas dígitos)."""

import re


def digits_only(phone: str | None) -> str:
    if not phone:
        return ""
    return re.sub(r"\D", "", str(phone))

