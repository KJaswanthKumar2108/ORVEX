import unittest

from analytics.features.electrical import calculate_apparent_power_kva, calculate_power_factor


class ElectricalFeatureTests(unittest.TestCase):
    def test_apparent_power_single_phase_conversion(self) -> None:
        self.assertAlmostEqual(calculate_apparent_power_kva(400.0, 10.0), 4.0)

    def test_apparent_power_three_phase_conversion(self) -> None:
        apparent = calculate_apparent_power_kva(400.0, 10.0, 3**0.5)
        self.assertAlmostEqual(apparent, 6.928203, places=5)

    def test_missing_electrical_value_returns_none(self) -> None:
        self.assertIsNone(calculate_apparent_power_kva(400.0, None))

    def test_apparent_power_rejects_impossible_inputs(self) -> None:
        self.assertIsNone(calculate_apparent_power_kva(-400.0, 10.0))
        self.assertIsNone(calculate_apparent_power_kva(400.0, float("inf")))

    def test_power_factor_is_derived_and_bounded(self) -> None:
        self.assertAlmostEqual(calculate_power_factor(8.0, 10.0), 0.8)
        self.assertIsNone(calculate_power_factor(11.0, 10.0))
        self.assertIsNone(calculate_power_factor(1.0, 0.0))
        self.assertIsNone(calculate_power_factor(None, 10.0))