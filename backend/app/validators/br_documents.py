"""
Validação de CPF e CNPJ (apenas dígitos, algoritmo oficial).
"""

from __future__ import annotations


def digits_only(value: str) -> str:
    return "".join(c for c in (value or "") if c.isdigit())


def is_valid_cpf(d: str) -> bool:
    """CPF com 11 dígitos (sem máscara)."""
    if len(d) != 11 or d == d[0] * 11:
        return False

    def check_digit(base: str, weights: list[int]) -> int:
        s = sum(int(base[i]) * weights[i] for i in range(len(weights)))
        r = s % 11
        return 0 if r < 2 else 11 - r

    w9 = list(range(10, 1, -1))
    d1 = check_digit(d, w9)
    if d1 != int(d[9]):
        return False
    w10 = list(range(11, 1, -1))
    d2 = check_digit(d, w10)
    return d2 == int(d[10])


def is_valid_cnpj(d: str) -> bool:
    """CNPJ com 14 dígitos (sem máscara)."""
    if len(d) != 14 or d == d[0] * 14:
        return False

    w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]

    def digit(base: str, weights: list[int]) -> int:
        s = sum(int(base[i]) * weights[i] for i in range(len(weights)))
        r = s % 11
        return 0 if r < 2 else 11 - r

    if digit(d, w1) != int(d[12]):
        return False
    if digit(d, w2) != int(d[13]):
        return False
    return True


def normalize_cpf_cnpj(raw: str | None) -> str | None:
    """Retorna só dígitos ou None se vazio."""
    if raw is None:
        return None
    d = digits_only(raw)
    return d if d else None
