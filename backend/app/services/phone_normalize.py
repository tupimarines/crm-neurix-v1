"""Normalização de telefone para match em CRM / webhooks (apenas dígitos)."""

import re


def digits_only(phone: str | None) -> str:
    if not phone:
        return ""
    return re.sub(r"\D", "", str(phone))


def format_brazil_phone_display(raw: str | None) -> str:
    """
    Formata dígitos para exibição pt-BR (espaços/hífen), sem inferir dígito 9.
    Cobre E.164 BR típico: 55 + DDD + 8 ou 9 dígitos locais.
    """
    d = digits_only(raw)
    if not d:
        return ""
    if d.startswith("55") and len(d) == 13:
        return f"{d[:2]} {d[2:4]} {d[4:9]}-{d[9:13]}"
    if d.startswith("55") and len(d) == 12:
        return f"{d[:2]} {d[2:4]} {d[4:8]}-{d[8:12]}"
    if not d.startswith("55") and len(d) == 11:
        return f"55 {d[:2]} {d[2:7]}-{d[7:11]}"
    if not d.startswith("55") and len(d) == 10:
        return f"55 {d[:2]} {d[2:6]}-{d[6:10]}"
    return d

