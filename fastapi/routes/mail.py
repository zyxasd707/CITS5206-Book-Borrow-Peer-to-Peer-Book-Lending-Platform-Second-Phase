from fastapi import APIRouter, Depends, HTTPException, status
from core.config import settings

import random
import time

from typing import Dict
from brevo import Brevo
from brevo.transactional_emails import SendTransacEmailRequestSender
from sqlalchemy.orm import Session

from models.mail import VerificationEmailRequest, ShipmentConfirmationRequest
from services.email_service import (
    get_brevo_config,
    get_brevo_sender,
    send_shipment_confirmation_email as send_shipment_via_brevo,
)

OTP_TTL_SECONDS = 600
otp_store: Dict[str, Dict[str, float]] = {}
router = APIRouter(prefix="/email", tags=["Email"])

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

@router.post("/send_shipment_confirmation", status_code=status.HTTP_200_OK)
def send_shipment_confirmation_email(shipment_request: ShipmentConfirmationRequest):
    try:
        send_shipment_via_brevo(
            email=shipment_request.email,
            username=shipment_request.username,
            order_id=shipment_request.order_id,
            tracking_number=shipment_request.tracking_number,
            courier_name=shipment_request.courier_name,
            estimated_delivery_date=shipment_request.estimated_delivery_date.strftime("%d/%m/%Y"),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send shipment confirmation email: {e}")

    return {"message": "Shipment confirmation email sent successfully."}
