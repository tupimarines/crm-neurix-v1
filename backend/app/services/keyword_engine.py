"""
Keyword Engine Service — Now loads rules from Supabase (editable).
Falls back to hardcoded defaults if DB is unavailable.
"""

from dataclasses import dataclass
from app.models.lead import LeadStage


@dataclass
class KeywordRule:
    keywords: list[str]
    target_stage: LeadStage
    priority: int


# Hardcoded fallback rules (used if DB is not reachable)
FALLBACK_RULES: list[KeywordRule] = [
    KeywordRule(
        keywords=["cardápio", "sabores", "sabor", "catálogo", "tipos", "frutas",
                  "morango", "damasco", "laranja", "figo", "me manda", "quais tem",
                  "opções", "variedade"],
        target_stage=LeadStage.ESCOLHENDO_SABORES,
        priority=1,
    ),
    KeywordRule(
        keywords=["quero comprar", "fechar", "pedido", "pagar", "pagamento",
                  "pix", "transferência", "boleto", "nota fiscal",
                  "quanto fica", "valor total", "preço", "desconto",
                  "comprar", "encomenda", "encomendar"],
        target_stage=LeadStage.AGUARDANDO_PAGAMENTO,
        priority=2,
    ),
    KeywordRule(
        keywords=["paguei", "comprovante", "transferi", "enviado",
                  "entrega", "rastreio", "recebido", "obrigado"],
        target_stage=LeadStage.ENVIADO,
        priority=3,
    ),
]


class KeywordEngine:
    """Analyzes chat messages and suggests lead stage transitions."""

    def __init__(self):
        self._cached_rules: list[KeywordRule] | None = None

    async def load_rules_from_db(self, supabase_client) -> list[KeywordRule]:
        """Load active keyword rules from Supabase."""
        try:
            response = supabase_client.table("keyword_rules") \
                .select("keywords, target_stage, priority") \
                .eq("is_active", True) \
                .order("priority", desc=True) \
                .execute()

            if response.data:
                rules = []
                for row in response.data:
                    rules.append(KeywordRule(
                        keywords=row["keywords"],
                        target_stage=LeadStage(row["target_stage"]),
                        priority=row["priority"],
                    ))
                self._cached_rules = rules
                return rules
        except Exception as e:
            print(f"⚠️ Could not load keyword rules from DB: {e}")

        return FALLBACK_RULES

    def analyze_message(self, message: str, rules: list[KeywordRule] | None = None) -> LeadStage | None:
        """
        Analyze a message and return the suggested stage transition.
        Returns None if no keyword match is found.
        """
        active_rules = rules or self._cached_rules or FALLBACK_RULES
        message_lower = message.lower()
        matches: list[KeywordRule] = []

        for rule in active_rules:
            for keyword in rule.keywords:
                if keyword.lower() in message_lower:
                    matches.append(rule)
                    break

        if not matches:
            return None

        best = max(matches, key=lambda r: r.priority)
        return best.target_stage


# Singleton
keyword_engine = KeywordEngine()
