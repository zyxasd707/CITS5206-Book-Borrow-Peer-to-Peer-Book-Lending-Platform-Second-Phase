from types import SimpleNamespace

from models.admin_setting import AdminSetting
from services.order_service import OrderService


def _checkout_item(**overrides):
    defaults = {
        "action_type": "borrow",
        "deposit": 20.0,
        "price": 3.0,
        "shipping_method": "pickup",
        "shipping_quote": 0.0,
    }
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


def test_order_amounts_use_admin_configured_platform_fee_once(db, restriction_guard_schema):
    db.add(AdminSetting(key="platform_fee_per_transaction", max_value=5.50))
    db.flush()

    order_groups = [
        [_checkout_item(deposit=20.0, price=3.0)],
        [_checkout_item(deposit=30.0, price=4.0)],
    ]

    amounts = OrderService.add_calculate_order_amounts(db, order_groups)

    assert amounts[0]["service_fee_amount"] == 5.50
    assert amounts[0]["order_total"] == 28.50
    assert amounts[1]["service_fee_amount"] == 0.0
