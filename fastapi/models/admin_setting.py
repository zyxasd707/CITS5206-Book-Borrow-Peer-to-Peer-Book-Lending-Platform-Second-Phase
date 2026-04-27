from sqlalchemy import Column, Integer, String, Numeric
from models.base import Base

class AdminSetting(Base):
    __tablename__ = "admin_settings"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String(100), unique=True, nullable=False)
    max_value = Column(Numeric(10, 2), nullable=False, default=2.00)
