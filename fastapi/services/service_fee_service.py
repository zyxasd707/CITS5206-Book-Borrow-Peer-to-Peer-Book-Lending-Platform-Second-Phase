from sqlalchemy.orm import Session
from models.admin_setting import AdminSetting
from models.service_fee import ServiceFee, ServiceFeeUpdate

DEFAULT_PLATFORM_SERVICE_FEE_AMOUNT = 2.0
PLATFORM_SERVICE_FEE_SETTING_KEY = "platform_fee_per_transaction"


def get_platform_service_fee_amount(db: Session) -> float:
    setting = db.query(AdminSetting).filter(
        AdminSetting.key == PLATFORM_SERVICE_FEE_SETTING_KEY
    ).first()
    return float(setting.max_value) if setting else DEFAULT_PLATFORM_SERVICE_FEE_AMOUNT

def get_all_fees(db: Session):
    return db.query(ServiceFee).all()

def get_fee(db: Session, fee_id: str):
    return db.query(ServiceFee).filter(ServiceFee.fee_id == fee_id).first()

def create_fee(db: Session, fee_in_data: dict):
    fee = ServiceFee(**fee_in_data)
    db.add(fee)
    db.commit()
    db.refresh(fee)
    return fee

def update_fee(db: Session, fee_id: str, fee_in: ServiceFeeUpdate):
    fee = get_fee(db, fee_id)
    if not fee:
        return None
    for field, value in fee_in.dict(exclude_unset=True).items():
        setattr(fee, field, value)
    db.commit()
    db.refresh(fee)
    return fee

def delete_fee(db: Session, fee_id: str):
    fee = get_fee(db, fee_id)
    if not fee:
        return False
    db.delete(fee)
    db.commit()
    return True
