from brevo import Brevo
from brevo.transactional_emails import SendTransacEmailRequestSender
from pathlib import Path

from core.config import settings

EMAIL_TEMPLATE_DIR = Path(__file__).resolve().parent.parent / "templates" / "emails"


def get_brevo_config():
    headers = None
    if settings.BREVO_KEY_TYPE != "api-key":
        headers = {settings.BREVO_KEY_TYPE: settings.BREVO_API_KEY}
    return {
        "api_key": settings.BREVO_API_KEY,
        "headers": headers,
    }


def get_brevo_sender() -> SendTransacEmailRequestSender:
    return SendTransacEmailRequestSender(
        email=settings.BREVO_SENDER_EMAIL,
        name=settings.BREVO_SENDER_NAME,
    )


def render_email_template(template_name: str, **context) -> str:
    template_path = EMAIL_TEMPLATE_DIR / template_name
    return template_path.read_text(encoding="utf-8").format(**context)


def send_shipment_confirmation_email(
    *,
    email: str,
    username: str,
    order_id: str,
    tracking_number: str,
    courier_name: str,
    estimated_delivery_date: str,
):
    configuration = get_brevo_config()
    api_instance = Brevo(**configuration).transactional_emails
    sender = get_brevo_sender()

    template_context = {
        "username": username,
        "order_id": order_id,
        "tracking_number": tracking_number,
        "carrier": courier_name,
        "estimated_delivery_date": estimated_delivery_date,
    }

    html_content = render_email_template(
        "shipment_confirmation.html",
        **template_context,
    )
    text_content = render_email_template(
        "shipment_confirmation.txt",
        **template_context,
    )

    api_instance.send_transac_email(
        sender=sender,
        to=[{"email": email}],
        subject="BookBorrow Shipment Confirmation",
        html_content=html_content,
        text_content=text_content,
    )


def send_shipment_status_email(
    *,
    email: str,
    username: str,
    order_id: str,
    tracking_number: str,
    courier_name: str,
    estimated_delivery_date: str,
    recipient_role: str,
):
    configuration = get_brevo_config()
    api_instance = Brevo(**configuration).transactional_emails
    sender = get_brevo_sender()

    if recipient_role == "owner":
        subject = "BookBorrow Shipment Recorded"
        html_content = (
            f"<p>Hello, {username},</p>"
            f"<p>Your shipment for order <strong>{order_id}</strong> has been recorded.</p>"
            f"<p>Carrier: <strong>{courier_name}</strong><br/>"
            f"Tracking number: <strong>{tracking_number}</strong><br/>"
            f"Estimated delivery date: <strong>{estimated_delivery_date}</strong></p>"
        )
        text_content = (
            f"Hello, {username}. "
            f"Your shipment for order {order_id} has been recorded. "
            f"Carrier: {courier_name}. "
            f"Tracking number: {tracking_number}. "
            f"Estimated delivery date: {estimated_delivery_date}."
        )
    else:
        subject = "BookBorrow Shipment Update"
        html_content = (
            f"<p>Hello, {username},</p>"
            f"<p>Your order <strong>{order_id}</strong> has been shipped.</p>"
            f"<p>Carrier: <strong>{courier_name}</strong><br/>"
            f"Tracking number: <strong>{tracking_number}</strong><br/>"
            f"Estimated delivery date: <strong>{estimated_delivery_date}</strong></p>"
        )
        text_content = (
            f"Hello, {username}. "
            f"Your order {order_id} has been shipped. "
            f"Carrier: {courier_name}. "
            f"Tracking number: {tracking_number}. "
            f"Estimated delivery date: {estimated_delivery_date}."
        )

    api_instance.send_transac_email(
        sender=sender,
        to=[{"email": email}],
        subject=subject,
        html_content=html_content,
        text_content=text_content,
    )


def send_order_confirmation_receipt_email(
    *,
    email: str,
    username: str,
    payment_id: str,
    total_amount: float,
    order_created_at: str,
    payment_method: str,
    contact_name: str,
    phone: str | None,
    street: str,
    city: str,
    postcode: str,
    country: str,
    orders: list[dict],
):
    configuration = get_brevo_config()
    api_instance = Brevo(**configuration).transactional_emails
    sender = get_brevo_sender()

    order_rows = []
    text_rows = []
    for order in orders:
        books = ", ".join(order.get("books", [])) or "No books listed"
        order_rows.append(
            "<tr>"
            f"<td style='padding:8px;border:1px solid #ddd;'>{order['order_id']}</td>"
            f"<td style='padding:8px;border:1px solid #ddd;'>{order['action_type']}</td>"
            f"<td style='padding:8px;border:1px solid #ddd;'>{order['shipping_method']}</td>"
            f"<td style='padding:8px;border:1px solid #ddd;'>{books}</td>"
            f"<td style='padding:8px;border:1px solid #ddd;'>${order['deposit_or_sale_amount']:.2f}</td>"
            f"<td style='padding:8px;border:1px solid #ddd;'>${order.get('owner_income_amount', 0):.2f}</td>"
            f"<td style='padding:8px;border:1px solid #ddd;'>${order['shipping_fee_amount']:.2f}</td>"
            f"<td style='padding:8px;border:1px solid #ddd;'>${order['service_fee_amount']:.2f}</td>"
            f"<td style='padding:8px;border:1px solid #ddd;'>${order['total_paid_amount']:.2f}</td>"
            "</tr>"
        )
        text_rows.append(
            f"- Order {order['order_id']} | {order['action_type']} | "
            f"{order['shipping_method']} | Books: {books} | "
            f"Item amount: ${order['deposit_or_sale_amount']:.2f} | "
            f"Rental fee: ${order.get('owner_income_amount', 0):.2f} | "
            f"Shipping: ${order['shipping_fee_amount']:.2f} | "
            f"Service fee: ${order['service_fee_amount']:.2f} | "
            f"Amount: ${order['total_paid_amount']:.2f}"
        )

    template_context = {
        "username": username,
        "payment_id": payment_id,
        "order_created_at": order_created_at,
        "payment_method": payment_method,
        "total_amount": f"${total_amount:.2f}",
        "contact_name": contact_name,
        "street": street,
        "city": city,
        "postcode": postcode,
        "country": country,
        "phone_line": phone or "",
        "orders_table_rows": "".join(order_rows),
        "orders_text_rows": "\n".join(text_rows),
    }

    html_content = render_email_template(
        "order_confirmation_receipt.html",
        **template_context,
    )
    text_content = render_email_template(
        "order_confirmation_receipt.txt",
        **template_context,
    )

    api_instance.send_transac_email(
        sender=sender,
        to=[{"email": email}],
        subject="BookBorrow Payment Confirmation and Receipt",
        html_content=html_content,
        text_content=text_content,
    )


def send_admin_damage_review_email(
    *,
    admin_email: str,
    admin_name: str | None,
    order_id: str,
    lender_name: str | None,
    borrower_name: str | None,
    severity: str,
    note: str | None,
    review_url: str,
):
    configuration = get_brevo_config()
    api_instance = Brevo(**configuration).transactional_emails
    sender = get_brevo_sender()

    display_name = admin_email
    html_content = (
        f"<p>Hi {display_name},</p>"
        f"<p>You received a notification from BookBorrow.</p>"
        f"<p>A returned book has been reported as <strong>{severity}</strong> damage "
        f"and is waiting in the complaint queue for admin review.</p>"
        f"<p>Please log in to the admin dashboard to review and resolve it.</p>"
        f"<p><strong>Order:</strong> {order_id}<br/>"
        f"<strong>Lender:</strong> {lender_name or '-'}<br/>"
        f"<strong>Borrower:</strong> {borrower_name or '-'}<br/>"
        f"<strong>Note:</strong> {note or '-'}</p>"
        f"<p><a href='{review_url}'>Log in and open the review</a></p>"
    )
    text_content = (
        f"Hi {display_name},\n\n"
        "You received a notification from BookBorrow.\n\n"
        f"A returned book has been reported as {severity} damage and is waiting in "
        "the complaint queue for admin review.\n\n"
        "Please log in to the admin dashboard to review and resolve it.\n\n"
        f"Order: {order_id}\n"
        f"Lender: {lender_name or '-'}\n"
        f"Borrower: {borrower_name or '-'}\n"
        f"Note: {note or '-'}\n\n"
        f"Log in and open the review: {review_url}"
    )

    api_instance.send_transac_email(
        sender=sender,
        to=[{"email": admin_email, "name": admin_name or admin_email}],
        subject="BookBorrow: Admin Notification",
        html_content=html_content,
        text_content=text_content,
    )


def send_admin_notification_email(
    *,
    admin_email: str,
    admin_name: str | None,
    notification_type: str,
    title: str,
    sender_name: str | None,
    sender_email: str | None,
    message: str,
    detail_url: str,
):
    configuration = get_brevo_config()
    api_instance = Brevo(**configuration).transactional_emails
    sender = get_brevo_sender()

    display_name = admin_name or "Admin"
    sender_display = sender_name or sender_email or "a BookBorrow user"
    html_content = (
        f"<p>Hi {display_name},</p>"
        f"<p>You received a BookBorrow admin notification.</p>"
        f"<p><strong>{notification_type}</strong> from <strong>{sender_display}</strong>:</p>"
        f"<p><strong>{title}</strong></p>"
        f"<p>{message}</p>"
        f"<p>Please log in to the admin dashboard to review and respond.</p>"
        f"<p><a href='{detail_url}'>Log in and open the notification</a></p>"
    )
    text_content = (
        f"Hi {display_name},\n\n"
        "You received a BookBorrow admin notification.\n\n"
        f"{notification_type} from {sender_display}:\n"
        f"{title}\n\n"
        f"{message}\n\n"
        "Please log in to the admin dashboard to review and respond.\n\n"
        f"Log in and open the notification: {detail_url}"
    )

    api_instance.send_transac_email(
        sender=sender,
        to=[{"email": admin_email, "name": display_name}],
        subject=f"BookBorrow: {notification_type}",
        html_content=html_content,
        text_content=text_content,
    )
