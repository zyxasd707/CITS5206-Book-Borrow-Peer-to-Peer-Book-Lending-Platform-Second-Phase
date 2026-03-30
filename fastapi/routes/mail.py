from fastapi import APIRouter, Depends, HTTPException, status
from core.config import settings

import random
import time

from typing import Dict
from brevo import Brevo
from brevo.transactional_emails import SendTransacEmailRequestSender
from sqlalchemy.orm import Session

from models.mail import VerificationEmailRequest, ReceiptEmailRequest, ShipmentConfirmationRequest

OTP_TTL_SECONDS = 600
otp_store: Dict[str, Dict[str, float]] = {}
router = APIRouter(prefix="/email", tags=["Email"])

# -------- Helper --------
def get_brevo_config():
    headers = None
    if settings.BREVO_KEY_TYPE != "api-key":
        headers = {settings.BREVO_KEY_TYPE: settings.BREVO_API_KEY}
    return {
        "api_key": settings.BREVO_API_KEY,
        "headers": headers,
    }


def get_brevo_sender() -> SendTransacEmailRequestSender:
    if not settings.BREVO_SENDER_EMAIL:
        raise HTTPException(
            status_code=500,
            detail="BREVO_SENDER_EMAIL is not configured.",
        )
    return SendTransacEmailRequestSender(
        email=settings.BREVO_SENDER_EMAIL,
        name=settings.BREVO_SENDER_NAME,
    )

def set_otp(email: str, ttl_seconds: int = OTP_TTL_SECONDS) -> str:
    otp = str(random.randint(100000, 999999))
    otp_store[email] = {
        "otp": otp,
        "expires": time.time() + ttl_seconds
    }
    return otp

def get_otp(email: str) -> str:
    record = otp_store.get(email)
    if not record:
        return None
    if time.time() > record["expires"]:
        del otp_store[email]
        return None
    return record["otp"]

def delete_otp(email: str):
    if email in otp_store:
        del otp_store[email]


# -------- Routes --------
@router.post("/send_verification", status_code=status.HTTP_200_OK)
def send_verification_email(verificationEmailRequest: VerificationEmailRequest):
    
    configuration = get_brevo_config()
    api_instance = Brevo(**configuration).transactional_emails
    sender = get_brevo_sender()
    otp = set_otp(verificationEmailRequest.emailAddress)
    display_name = verificationEmailRequest.username.strip() or "there"
    print("otp : " + otp)

    try:
        api_instance.send_transac_email(
            sender=sender,
            to=[{"email": verificationEmailRequest.emailAddress}],
            subject="Your BookBorrow verification code",
            html_content=(
                f"<p>Hello, {display_name},</p>"
                "<p>Your BookBorrow verification code is:</p>"
                f"<p style='font-size: 24px; font-weight: bold;'>{otp}</p>"
                "<p>This code will expire in 10 minutes.</p>"
            ),
            text_content=(
                f"Hello, {display_name}. "
                f"Your BookBorrow verification code is: {otp}. "
                "This code will expire in 10 minutes."
            ),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send email: {e}")

    return {"message": "Verification email sent successfully."}

@router.post("/verify_otp", status_code=status.HTTP_200_OK)
def verify_otp(verificationEmailRequest: VerificationEmailRequest):
    email = verificationEmailRequest.emailAddress
    user_input_otp = verificationEmailRequest.otp

    stored_otp = get_otp(email)
    print(stored_otp)
    if stored_otp is None:
        raise HTTPException(status_code=404, detail="OTP not found or expired")
    
    if stored_otp != user_input_otp:
        raise HTTPException(status_code=400, detail="Incorrect OTP")
    
    delete_otp(email)
    return {"message": "OTP verified successfully"}



@router.post("/send_receipt", status_code=status.HTTP_200_OK)
def send_receipt_email(receipt_request: ReceiptEmailRequest):

    configuration = get_brevo_config()
    api_instance = Brevo(**configuration).transactional_emails

    try:
        api_instance.send_transac_email(
            to=[{"email": receipt_request.email}],
            template_id=4,
            params={
                "username": receipt_request.username,
                "total_amount": f"${receipt_request.total_amount:.2f}",
                "order_id": receipt_request.order_id,
            },
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send receipt email: {e}")

    return {"message": "Receipt email sent successfully."}


@router.post("/send_shipment_confirmation", status_code=status.HTTP_200_OK)
def send_shipment_confirmation_email(shipment_request: ShipmentConfirmationRequest):
    configuration = get_brevo_config()
    api_instance = Brevo(**configuration).transactional_emails

    try:
        api_instance.send_transac_email(
            to=[{"email": shipment_request.email}],
            template_id=5,
            params={
                "order_id": shipment_request.order_id,
                "username": shipment_request.username,
                "tracking_number": shipment_request.tracking_number,
                "carrier": shipment_request.courier_name,
                "estimated_delivery_date": shipment_request.estimated_delivery_date.strftime("%d/%m/%Y"),
            },
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send shipment confirmation email: {e}")

    return {"message": "Shipment confirmation email sent successfully."}
