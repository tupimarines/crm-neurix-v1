"""Testes de formatação BR para exibição em leads / webhooks."""

import unittest

from app.services.phone_normalize import format_brazil_phone_display


class TestFormatBrazilPhoneDisplay(unittest.TestCase):
    def test_e164_br_12_digits(self):
        self.assertEqual(format_brazil_phone_display("554137984966"), "55 41 3798-4966")

    def test_e164_br_13_digits_mobile(self):
        self.assertEqual(format_brazil_phone_display("5541999999999"), "55 41 99999-9999")

    def test_masked_input(self):
        self.assertEqual(format_brazil_phone_display("+55 (41) 37984-966"), "55 41 3798-4966")

    def test_empty(self):
        self.assertEqual(format_brazil_phone_display(""), "")
        self.assertEqual(format_brazil_phone_display(None), "")


if __name__ == "__main__":
    unittest.main()
