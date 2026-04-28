from sqlalchemy.orm import Session
from fastapi import HTTPException
from models.order import Order, OrderBook
from models.user import User
from models.book import Book
from models.checkout import Checkout, CheckoutItem
from typing import List, Dict, Optional
from pydantic import BaseModel
from datetime import datetime, timezone
from collections import defaultdict
from services.cart_service import remove_cart_items_by_book_ids
from models.complaint import Complaint
from sqlalchemy import or_
from services.complaint_service import ComplaintService
from services.notification_service import NotificationService
from typing import Set
import logging
from services.email_service import (
    send_order_confirmation_receipt_email,
    send_shipment_status_email,
)

logger = logging.getLogger(__name__)
PLATFORM_SERVICE_FEE_AMOUNT = 2.0

class OrderService:
    """
    Order business logic service - handles validation, business rules, and complex operations
    """
    def __init__(self, db: Session):
        self.db = db


    @staticmethod
    def validate_checkout_item(checkout_item: CheckoutItem, db: Session, user_id: str) -> None:
   
        book: Book = db.query(Book).filter(Book.id == checkout_item.book_id).first()
        if not book:
            raise HTTPException(
                status_code=404,
                detail=f"Book with id {checkout_item.book_id} not found"
            )

        if book.status != "listed":
            raise HTTPException(
                status_code=400,
                detail=f"Book '{book.title_en}' is not available (status={book.status})"
            )

        if checkout_item.action_type.lower() == "borrow" and not book.can_rent:
            raise HTTPException(
                status_code=400,
                detail=f"Book '{book.title_en}' cannot be borrowed"
            )

        if checkout_item.action_type.lower() == "purchase" and not book.can_sell:
            raise HTTPException(
                status_code=400,
                detail=f"Book '{book.title_en}' cannot be purchased"
            )
        
        # cannot place orders for books that you have published yourself
        if checkout_item.owner_id == user_id:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot create an order for your own book '{book.title_en}'"
            )

    @staticmethod
    def split_checkout_to_orders(checkout: Checkout, db: Session, user_id: str):
        """
        Group the Checkout items by owner action_type to generate the order list 
        and verify whether each book is valid before grouping.

        Returns:
            order_data (List[List[CheckoutItem]]): 
                A list of "orders", where each inner list contains CheckoutItem objects 
                belonging to the same owner and action type. 
                Example structure:

                [
                    [CheckoutItem1, CheckoutItem2],  # owner1 borrow
                    [CheckoutItem3],                  # owner1 purchase
                    [CheckoutItem4],                  # owner2 borrow
                    [CheckoutItem5]                   # owner2 purchase
                ]
        """
        groups = defaultdict(list)

        for item in checkout.items:
            # validate books
            OrderService.validate_checkout_item(item, db, user_id=user_id)  
            
            # Group by owner_id and action_type
            key = (item.owner_id, item.action_type.lower())
            groups[key].append(item)

        # transfer to list
        orders_data = list(groups.values())
        return orders_data

    @staticmethod
    def _calculate_service_fee(base_amount: float) -> float:
        """Platform service fee is fixed at $2 per transaction."""
        return PLATFORM_SERVICE_FEE_AMOUNT if float(base_amount or 0) > 0 else 0.0

    @staticmethod
    def _is_post_shipping(shipping_method: Optional[str]) -> bool:
        method = (shipping_method or "").strip().lower()
        return method in {"post", "delivery"}

    
    @staticmethod
    def add_calculate_order_amounts(db: Session, orders_data: List[List[CheckoutItem]]) -> List[Dict]:
        """
        For each group of CheckoutItems (owner + action_type), calculate amounts
        and return a dict that contains:
            - items: List[CheckoutItem]
            - deposit_or_sale_amount
            - owner_income_amount
            - service_fee_amount
            - shipping_out_fee_amount
            - order_total

        Return examples (post-PR-#88: fixed $2 service fee charged ONCE on
        the first order in a multi-order checkout, $0 on the rest):
            [
                {
                    "items": [CheckoutItem(ci1), CheckoutItem(ci2)],  # borrow, owner1 (first)
                    "deposit_or_sale_amount": 25.0,                   # 10 + 15
                    "owner_income_amount": 2.5,
                    "service_fee_amount": 2.0,                        # PLATFORM_SERVICE_FEE_AMOUNT
                    "shipping_out_fee_amount": 3.0,                   # first post shipping_quote
                    "order_total": 32.5                               # 25 + 2.5 + 2 + 3
                },
                {
                    "items": [CheckoutItem(ci3)],                     # purchase, owner1
                    "deposit_or_sale_amount": 20.0,                   # purchase price
                    "service_fee_amount": 0.0,                        # 0 — fee already charged on first order
                    "shipping_out_fee_amount": 0.0,                   # pickup, no shipping
                    "order_total": 20.0                                # 20 + 0 + 0
                },
                {
                    "items": [CheckoutItem(ci4)],                     # purchase, owner2
                    "deposit_or_sale_amount": 25.0,                   # purchase price
                    "service_fee_amount": 0.0,                        # 0 — fee already charged on first order
                    "shipping_out_fee_amount": 4.0,                   # post shipping
                    "order_total": 29.0                                # 25 + 0 + 4
                }
            ]
        """
        results = []

        for index, order_items in enumerate(orders_data):
            if not order_items:
                continue

            deposit_or_sale_amount = 0
            owner_income_amount = 0
            shipping_out_fee_amount = 0

            # Calculate deposit or sale price
            for item in order_items:
                if item.action_type.lower() == "purchase":
                    # for purchasing, use price
                    deposit_or_sale_amount += float(item.price or 0)
                elif item.action_type.lower() == "borrow":
                    # for borrowing, use deposit
                    deposit_or_sale_amount += float(item.deposit or 0)
                    owner_income_amount += float(item.price or 0)

            # Calculate shipping fee
            post_items = [item for item in order_items if OrderService._is_post_shipping(item.shipping_method)]
            if post_items:
                # Multiple items only post once
                # if pickup, shipping_out_fee_amount = 0
                shipping_out_fee_amount = float(post_items[0].shipping_quote or 0)

            # Platform service fee = fixed $2 (PLATFORM_SERVICE_FEE_AMOUNT),
            # charged ONCE per checkout — only on the first order, not on
            # subsequent orders in a multi-owner checkout.
            service_fee_base = deposit_or_sale_amount + owner_income_amount + shipping_out_fee_amount
            service_fee_amount = OrderService._calculate_service_fee(service_fee_base) if index == 0 else 0.0

            # keep original item
            results.append({
                "items": order_items,  # Keep CheckoutItem 
                "deposit_or_sale_amount": deposit_or_sale_amount,
                "owner_income_amount": owner_income_amount,
                "service_fee_amount": service_fee_amount,
                "shipping_out_fee_amount": shipping_out_fee_amount,
                "order_total": deposit_or_sale_amount + owner_income_amount + service_fee_amount + shipping_out_fee_amount
            })

        return results
    
    @staticmethod
    def create_orders_data_with_validation(db: Session, checkout_id: str, user_id: str, payment_id: str):
        checkout = db.query(Checkout).filter(Checkout.checkout_id == checkout_id).first()
        if not checkout:
            raise HTTPException(status_code=404, detail=f"Checkout {checkout_id} not found")
        if checkout.user_id != user_id:
            raise HTTPException(status_code=403, detail="Access denied: Checkout does not belong to this user")
    
        orders_data_without_price = OrderService.split_checkout_to_orders(checkout, db, user_id=user_id)
        orders_data = OrderService.add_calculate_order_amounts(db, orders_data=orders_data_without_price)
        created_orders = []
        all_book_ids = set() # for remove items later
        for order_info in orders_data:
            items = order_info["items"]
            first_item = items[0]

            # Create order obj
            order = Order(
                owner_id = first_item.owner_id,
                borrower_id = checkout.user_id,
                action_type = first_item.action_type.lower(),
                shipping_method = "post" if OrderService._is_post_shipping(first_item.shipping_method) else "pickup",
                deposit_or_sale_amount = order_info["deposit_or_sale_amount"],
                owner_income_amount = order_info["owner_income_amount"],
                service_fee_amount = order_info["service_fee_amount"],
                shipping_out_fee_amount = order_info["shipping_out_fee_amount"],
                total_paid_amount = order_info["order_total"],
                contact_name = checkout.contact_name,
                phone = checkout.phone,
                street = checkout.street,
                city = checkout.city,
                postcode = checkout.postcode,
                country = checkout.country,

                # new fields
                estimated_delivery_time = first_item.estimated_delivery_time,
                payment_id = payment_id,
            )
            db.add(order)
            db.flush()

            # Create OrderBook entries
            for item in items:
                order_book = OrderBook(
                    order_id=order.id,
                    book_id=item.book_id
                )
                db.add(order_book)

                # Update book status based on action type
                book = db.query(Book).filter(Book.id == item.book_id).first()
                if book:
                    # For borrow/rent: set to 'lent'
                    # For purchase: set to 'sold'
                    if order.action_type == "borrow":
                        book.status = "lent"
                    elif order.action_type == "purchase":
                        book.status = "sold"
                    else:
                        book.status = "unlisted"
                    all_book_ids.add(book.id)
            created_orders.append(order)
        # checkout.status
        checkout.status = "COMPLETED"
        db.commit()

        # remove items from cart
        current_user = db.query(User).filter(User.user_id == user_id).first()
        try:
            remove_cart_items_by_book_ids(db, book_ids=list(all_book_ids), current_user=current_user)
        except Exception as e:
            print(f"Failed to clear cart items after checkout: {e}")

        if current_user and current_user.email:
            try:
                send_order_confirmation_receipt_email(
                    email=current_user.email,
                    username=current_user.name or "there",
                    payment_id=payment_id,
                    total_amount=sum(float(order.total_paid_amount or 0) for order in created_orders),
                    order_created_at=created_orders[0].created_at.strftime("%d/%m/%Y %H:%M") if created_orders and created_orders[0].created_at else "",
                    payment_method="Card via Stripe",
                    contact_name=checkout.contact_name,
                    phone=checkout.phone,
                    street=checkout.street,
                    city=checkout.city,
                    postcode=checkout.postcode,
                    country=checkout.country,
                    orders=[
                        {
                            "order_id": order.id,
                            "action_type": order.action_type,
                            "shipping_method": order.shipping_method,
                            "deposit_or_sale_amount": float(order.deposit_or_sale_amount or 0),
                            "owner_income_amount": float(order.owner_income_amount or 0),
                            "shipping_fee_amount": float(order.shipping_out_fee_amount or 0),
                            "service_fee_amount": float(order.service_fee_amount or 0),
                            "total_paid_amount": float(order.total_paid_amount or 0),
                            "books": [ob.book.title_or for ob in order.books if ob.book],
                        }
                        for order in created_orders
                    ],
                )
            except Exception as e:
                logger.exception("Failed to send confirmation/receipt email for checkout %s: %s", checkout_id, e)
        return created_orders
    

    @staticmethod
    def get_orders_by_user(
        db: Session, 
        user_id: str, 
        status: Optional[str] = None, 
        skip: int = 0, 
        limit: int = 20
    ) -> List[dict]:
        
        user = db.query(User).filter(User.user_id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        if user.is_admin:
            query = db.query(Order)
        else:
            query = db.query(Order).filter(
                or_(
                    Order.borrower_id == user_id,
                    Order.owner_id == user_id
                )
            )

        if status:
            query = query.filter(Order.status == status)

        orders = query.offset(skip).limit(limit).all()  
        result = []

        for order in orders:
            books_info = []
            for ob in order.books:
                if ob.book:
                    books_info.append({
                        "id": ob.book.id,
                        "title": ob.book.title_or,
                        "cover": ob.book.cover_img_url,
                    })

            result.append({
                "order_id": order.id,
                "status": order.status,
                "action_type": order.action_type,
                "total_paid_amount": float(order.total_paid_amount),
                "books": books_info,
                "create_at": Order._to_utc_iso(order.created_at),
                "due_at": Order._to_utc_iso(order.due_at),
                "completed_at": Order._to_utc_iso(order.completed_at),
                "owner_id": order.owner_id,
                "borrower_id": order.borrower_id,
                "shipping_out_tracking_number": order.shipping_out_tracking_number,
                "shipping_return_tracking_number": order.shipping_return_tracking_number,
            })
        return result
    
    @staticmethod
    def get_order_detail(db: Session, order_id: str, current_user: User) -> Optional[Dict]:
        order = db.query(Order).filter(Order.id == order_id).first()
        if not order:
            return None    
        if not current_user.is_admin and order.borrower_id != current_user.user_id and order.owner_id != current_user.user_id:
            raise HTTPException(status_code=403, detail="Not authorized to view this order")
        return order.to_dict(include_books = True)

        
    @staticmethod
    def cancel_order(db: Session, order_id: str, current_user: User) -> bool:
        """
        Cancel an order if it's in a cancellable state
        
        Args:
            db: Database session
            order_id: Order ID to cancel
            current_user: User
            
        Returns:
            bool: True if cancellation was successful
            
        Raises:
            HTTPException: If order not found, unauthorized, or not cancellable
        """
        order = db.query(Order).filter(Order.id == order_id).first()
        
        if not order:
            raise HTTPException(
                status_code=404,
                detail="Order not found"
            )
        
        # Check authorization - only borrower can cancel their order
        if order.borrower_id != current_user.user_id and not current_user.is_admin:
            raise HTTPException(
                status_code=403,
                detail="Not authorized to cancel this order"
            )
        
        # Check if order can be cancelled
        cancellable_statuses = ["PENDING_PAYMENT", "PENDING_SHIPMENT"]
        if order.status not in cancellable_statuses:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot cancel order with status '{order.status}'. Only orders with status {cancellable_statuses} can be cancelled."
            )
        
        # MVP6: If order is PENDING_SHIPMENT with payment, trigger refund first
        # refund_on_cancel() handles: CANCELED status, book restore, CANCELED + REFUND notifications, commit
        if order.status == "PENDING_SHIPMENT":
            try:
                from services.payment_gateway_service import refund_on_cancel
                refund_on_cancel(db=db, order_id=order_id, actor=current_user.user_id)
                return True
            except Exception as e:
                logger.warning(f"Refund on cancel failed for order {order_id}, proceeding with plain cancel: {e}")
                db.refresh(order)
                if order.status == "CANCELED":
                    return True  # refund_on_cancel already cancelled it

        # Update order status to CANCELED
        order.status = "CANCELED"
        order.canceled_at = datetime.now(timezone.utc)

        # Notify both parties
        NotificationService.create(
            db, user_id=order.borrower_id, order_id=order.id,
            type="CANCELED",
            title="Order Cancelled",
            message=f"Your order has been cancelled. If payment was made, a refund will be processed.",
            commit=False,
        )
        NotificationService.create(
            db, user_id=order.owner_id, order_id=order.id,
            type="CANCELED",
            title="Order Cancelled",
            message=f"An order for your book has been cancelled by the borrower.",
            commit=False,
        )

        # Restore book availability - set books back to 'listed' status
        for order_book in order.books:
            if order_book.book:
                book = db.query(Book).filter(Book.id == order_book.book_id).first()
                # Restore to listed if it was unlisted, lent, or sold due to this order
                if book.status in ["unlisted", "lent", "sold"]:
                    book.status = "listed"

        db.commit()
        return True

    @staticmethod
    def get_user_tracking_numbers(
        db: Session,
        current_user: User,
        target_user_id: Optional[str] = None
    ) -> List[Dict[str, Optional[str]]]:
        """
        Return AUPOST shipping out and return tracking numbers per order for a user.
        Each item includes order_id and tracking numbers (or None if not AUPOST).

        Example:
        [
            {
                "order_id": "ORD123",
                "shipping_out_tracking_number": "OUT123",
                "shipping_return_tracking_number": "RET123"
            },
            ...
        ]
        """
        user_id = target_user_id or current_user.user_id

        # authorization check: allow if admin or user querying themselves
        if not current_user.is_admin and current_user.user_id != user_id:
            raise HTTPException(status_code=403, detail="Not authorized")

        orders = db.query(Order).filter(
            (Order.borrower_id == user_id) | (Order.owner_id == user_id)
        ).all()

        result = []
        for order in orders:
            out_num = order.shipping_out_tracking_number if order.shipping_out_carrier == "AUSPOST" else None
            return_num = order.shipping_return_tracking_number if order.shipping_return_carrier == "AUSPOST" else None
            first_book = next((ob.book for ob in order.books if ob.book), None)
            book_title = None
            if first_book:
                book_title = first_book.title_or or first_book.title_en

            if order.owner_id == user_id:
                counterpart_name = order.borrower.name if order.borrower else None
                counterpart_role = "Borrower"
            else:
                counterpart_name = order.owner.name if order.owner else None
                counterpart_role = "Owner"

            # Only include if at least one AUPOST tracking number exists
            if out_num or return_num:
                result.append({
                    "order_id": order.id,
                    "shipping_out_tracking_number": out_num,
                    "shipping_return_tracking_number": return_num,
                    "book_title": book_title,
                    "counterpart_name": counterpart_name,
                    "counterpart_role": counterpart_role,
                    "created_at": order.created_at,
                    "updated_at": order.updated_at,
                    "start_at": order.start_at,
                    "returned_at": order.returned_at,
                })

        return result
    





    # order status service
    @staticmethod
    def confirm_payment(db: Session, order_id: str) -> bool:
        """
        Confirm payment received, transition PENDING_PAYMENT → PENDING_SHIPMENT
        """
        order = db.query(Order).filter(Order.id == order_id).first()
        
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")

        if order.status != "PENDING_PAYMENT":
            raise HTTPException(
                status_code=400,
                detail=f"Cannot confirm payment for order with status '{order.status}'"
            )
        
        order.status = "PENDING_SHIPMENT"

        # Notify borrower: payment confirmed
        NotificationService.create(
            db, user_id=order.borrower_id, order_id=order.id,
            type="PAYMENT_CONFIRMED",
            title="Payment Confirmed",
            message=f"Your payment of ${float(order.total_paid_amount):.2f} has been confirmed. Waiting for the lender to ship.",
            commit=False,
        )
        # Notify owner: new order received
        NotificationService.create(
            db, user_id=order.owner_id, order_id=order.id,
            type="PAYMENT_CONFIRMED",
            title="New Order Received",
            message=f"A borrower has paid for your book. Please ship within 3 days.",
            commit=False,
        )

        db.commit()
        db.refresh(order)
        return True
    

    @staticmethod
    def confirm_shipment(
        db: Session, 
        order_id: str, 
        current_user: User,
        tracking_number: str,
        carrier: str
    ) -> bool:
        """
        Confirm shipment with tracking number and carrier
        
        Logic:
            - If status is PENDING_SHIPMENT -> update shipping_out_* (outbound, owner confirms)
            - If status is BORROWING or OVERDUE -> update shipping_return_* (return, borrower confirms)
        """
        order = db.query(Order).filter(Order.id == order_id).first()
        
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")
        
        # Validate carrier
        carrier_upper = carrier.upper()
        if carrier_upper not in ["AUSPOST", "OTHER"]:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid carrier '{carrier}'. Must be 'AUSPOST' or 'OTHER'"
            )
        
        # Check status and permissions
        if order.status == "PENDING_SHIPMENT":
            # Outbound: only owner can confirm
            if order.owner_id != current_user.user_id and not current_user.is_admin:
                raise HTTPException(status_code=403, detail="Only owner can confirm outbound shipment")
            
            # Update outbound tracking
            order.shipping_out_carrier = carrier_upper
            order.shipping_out_tracking_number = tracking_number
            
            # Calculate start_at and due_at
            from datetime import timedelta
            now = datetime.now(timezone.utc)
            
            order.start_at = now + timedelta(days=order.estimated_delivery_time or 3)
            
            max_lending_days = max(
                (ob.book.max_lending_days for ob in order.books if ob.book and ob.book.max_lending_days),
                default=20
            )
            order.due_at = order.start_at + timedelta(days=max_lending_days)

            estimated_delivery_date = order.start_at.strftime("%d/%m/%Y") if order.start_at else "TBD"

            # Notify borrower: book shipped
            NotificationService.create(
                db, user_id=order.borrower_id, order_id=order.id,
                type="SHIPMENT_SENT",
                title="Book Shipped",
                message=f"The lender has shipped your book. Tracking: {tracking_number} ({carrier_upper}).",
                commit=False,
            )

            try:
                borrower_name = (order.borrower.name if order.borrower and order.borrower.name else "there")
                owner_name = (order.owner.name if order.owner and order.owner.name else "there")

                if order.borrower and order.borrower.email:
                    send_shipment_status_email(
                        email=order.borrower.email,
                        username=borrower_name,
                        order_id=order.id,
                        tracking_number=tracking_number,
                        courier_name=carrier_upper,
                        estimated_delivery_date=estimated_delivery_date,
                        recipient_role="borrower",
                    )

                if order.owner and order.owner.email:
                    send_shipment_status_email(
                        email=order.owner.email,
                        username=owner_name,
                        order_id=order.id,
                        tracking_number=tracking_number,
                        courier_name=carrier_upper,
                        estimated_delivery_date=estimated_delivery_date,
                        recipient_role="owner",
                    )
            except Exception as e:
                logger.warning("Failed to send shipment status emails: %s", e)

            # implement distribute shipping fee function
            try:
                payment_id = order.payment_id
                if payment_id:
                    data = {"lender_account_id": order.owner.stripe_account_id}
                    from services.payment_gateway_service import distribute_shipping_fee
                    distribute_shipping_fee(payment_id, data, db=db)
            except Exception as e:
                print(f"[WARN] distribute_shipping_fee failed: {e}")
                
            
        elif order.status in ["BORROWING", "OVERDUE"]:
            # Return: only borrower can confirm
            if order.borrower_id != current_user.user_id and not current_user.is_admin:
                raise HTTPException(status_code=403, detail="Only borrower can confirm return shipment")
            
            # Update return tracking
            order.shipping_return_carrier = carrier_upper
            order.shipping_return_tracking_number = tracking_number

            # Update status to RETURNED
            order.status = "RETURNED"
            order.returned_at = datetime.now(timezone.utc)

            # Notify owner: book returned
            NotificationService.create(
                db, user_id=order.owner_id, order_id=order.id,
                type="RETURNED",
                title="Book Returned",
                message=f"The borrower has shipped your book back. Tracking: {tracking_number} ({carrier_upper}).",
                commit=False,
            )
            # Notify borrower: return confirmed
            NotificationService.create(
                db, user_id=order.borrower_id, order_id=order.id,
                type="RETURNED",
                title="Return Shipment Confirmed",
                message=f"Your return shipment has been recorded. Waiting for the lender to confirm receipt.",
                commit=False,
            )
                
        else:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot confirm shipment for status '{order.status}'. Valid: PENDING_SHIPMENT, BORROWING, OVERDUE"
            )

        db.commit()
        db.refresh(order)
        return True


    @staticmethod
    def update_borrowing_status(db: Session) -> int:
        """
        Background task: Update orders to BORROWING when start_at is reached
        Should be run periodically (e.g., every hour)
        
        Returns: number of orders updated
        """
        now = datetime.now(timezone.utc)
        now = now.replace(tzinfo=None)

        orders = db.query(Order).filter(
            Order.status == "PENDING_SHIPMENT",
            Order.start_at <= now,
            Order.start_at.isnot(None)
        ).all()

        count = 0
        for order in orders:
            order.status = "BORROWING"
            NotificationService.create(
                db, user_id=order.borrower_id, order_id=order.id,
                type="BORROWING",
                title="Borrowing Started",
                message=f"Your book has been delivered. The borrowing period has started. Due date: {order.due_at.strftime('%d/%m/%Y') if order.due_at else 'N/A'}.",
                commit=False,
            )
            NotificationService.create(
                db, user_id=order.owner_id, order_id=order.id,
                type="BORROWING",
                title="Book Delivered",
                message=f"Your book has been delivered to the borrower. Borrowing period started.",
                commit=False,
            )
            count += 1

        db.commit()
        return count

    @staticmethod
    def borrower_confirm_received(db: Session, order_id: str, current_user: User) -> bool:
        order = db.query(Order).filter(Order.id == order_id).first()

        if not order:
            raise HTTPException(status_code=404, detail="Order not found")

        if order.borrower_id != current_user.user_id and not current_user.is_admin:
            raise HTTPException(status_code=403, detail="Only borrower can confirm receipt")

        if order.status != "PENDING_SHIPMENT":
            raise HTTPException(
                status_code=400,
                detail=f"Cannot confirm receipt for order with status '{order.status}'",
            )

        if not order.shipping_out_tracking_number:
            raise HTTPException(
                status_code=400,
                detail="Outbound tracking must be recorded before confirming receipt",
            )

        now = datetime.now(timezone.utc)
        if order.action_type == "purchase":
            order.status = "COMPLETED"
            order.completed_at = now

            NotificationService.create(
                db,
                user_id=order.borrower_id,
                order_id=order.id,
                type="COMPLETED",
                title="Order Completed",
                message="You confirmed receipt of the purchased book. The order is now complete.",
                commit=False,
            )
            NotificationService.create(
                db,
                user_id=order.owner_id,
                order_id=order.id,
                type="COMPLETED",
                title="Order Completed",
                message="The buyer confirmed receiving the book. The order is now complete.",
                commit=False,
            )
        else:
            from datetime import timedelta

            order.status = "BORROWING"
            order.start_at = now

            max_lending_days = max(
                (ob.book.max_lending_days for ob in order.books if ob.book and ob.book.max_lending_days),
                default=20,
            )
            order.due_at = now + timedelta(days=max_lending_days)

            NotificationService.create(
                db,
                user_id=order.borrower_id,
                order_id=order.id,
                type="BORROWING",
                title="Book Received",
                message="You confirmed receipt of the shipped book. The borrowing period has started.",
                commit=False,
            )
            NotificationService.create(
                db,
                user_id=order.owner_id,
                order_id=order.id,
                type="BORROWING",
                title="Borrower Confirmed Receipt",
                message="The borrower confirmed receiving the book. The borrowing period has started.",
                commit=False,
            )

        db.commit()
        db.refresh(order)
        return True



    @staticmethod
    def update_overdue_status(db: Session) -> int:
        """
        Background task: Update orders to OVERDUE when due_at is passed
        Should be run periodically (e.g., every hour)
        
        Returns: number of orders updated
        """

        now = datetime.now(timezone.utc)
        now = now.replace(tzinfo=None)
        orders = db.query(Order).filter(
            Order.status == "BORROWING",
            Order.due_at.isnot(None),
            Order.due_at <= now
        ).all()

        if not orders:
            return 0
        

        order_ids = [o.id for o in orders]

        # Find existing overdue orders, avoiding repeated creating complaints
        existing = (
            db.query(Complaint.order_id)
              .filter(
                  Complaint.order_id.in_(order_ids),
                  Complaint.status.in_(("pending", "investigating")),
              )
              .all()
        )
        existed_ids: Set[str] = {row[0] for row in existing}
        
        count = 0
        try:
            for order in orders:
                if order.id not in existed_ids:
                # create new complaint
                    ComplaintService.create(
                        db=db,
                        complainant_id=order.owner_id, 
                        respondent_id=order.borrower_id,  
                        order_id=order.id,
                        type="other",  
                        subject=f"Order {order.id} is overdue",
                        description=f"This order was due on {order.due_at} but has not been returned.",
                        commit=False
                    )
                    
                order.status = "OVERDUE"
                NotificationService.create(
                    db, user_id=order.borrower_id, order_id=order.id,
                    type="OVERDUE",
                    title="Order Overdue",
                    message=f"Your borrowing order is overdue (due: {order.due_at.strftime('%d/%m/%Y') if order.due_at else 'N/A'}). Please return the book as soon as possible.",
                    commit=False,
                )
                NotificationService.create(
                    db, user_id=order.owner_id, order_id=order.id,
                    type="OVERDUE",
                    title="Order Overdue",
                    message=f"A borrower has not returned your book on time. A complaint has been filed automatically.",
                    commit=False,
                )
                count += 1
                
            db.commit()
            return count
        except Exception:
            db.rollback()
            raise

    @staticmethod
    def update_completed_status(db: Session) -> int:
        """
        Background task: Update orders to COMPLETED when returned package is delivered
        Transition: RETURNED -> COMPLETED after estimated_delivery_time
        
        Returns: number of orders updated
        """
        from datetime import timedelta
        now = datetime.now(timezone.utc)
        now = now.replace(tzinfo=None)
        orders = db.query(Order).filter(
            Order.status == "RETURNED",
            Order.returned_at.isnot(None)
        ).all()
        
        count = 0
        for order in orders:
            # Calculate expected delivery date: returned_at + estimated_delivery_time
            delivery_time = order.estimated_delivery_time or 7
            expected_delivery = order.returned_at + timedelta(days=delivery_time + 10) # 10 more days

            if now >= expected_delivery:
                order.status = "COMPLETED"
                order.completed_at = now

                # Restore book availability for borrowed books
                if order.action_type == "borrow":
                    for order_book in order.books:
                        if order_book.book:
                            book = db.query(Book).filter(Book.id == order_book.book_id).first()
                            if book and book.status == "lent":
                                book.status = "listed"

                NotificationService.create(
                    db, user_id=order.borrower_id, order_id=order.id,
                    type="COMPLETED",
                    title="Order Completed",
                    message=f"Your order has been completed. The deposit refund will be processed.",
                    commit=False,
                )
                NotificationService.create(
                    db, user_id=order.owner_id, order_id=order.id,
                    type="COMPLETED",
                    title="Order Completed",
                    message=f"The borrowing order has been completed. The book has been returned.",
                    commit=False,
                )
                count += 1

        db.commit()
        return count
    
    @staticmethod
    def owner_confirm_received(
        db: Session,
        order_id: str,
        current_user: User,
        damage_severity: Optional[str] = None,
        note: Optional[str] = None,
        evidence_photos: Optional[List[str]] = None,
    ) -> bool:
        """
        Owner manually confirms that returned books are received.

        MVP6-1: accepts optional damage report. severity='none' (or omitted)
        keeps the existing flow (auto deposit release). severity in
        {light, medium, severe} puts the deposit in 'pending_review' for
        admin arbitration and records the lender's evidence.
        """
        order = db.query(Order).filter(Order.id == order_id).first()
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")

        if order.status != "RETURNED":
            raise HTTPException(status_code=400, detail="Order is not in RETURNED status")

        if order.owner_id != current_user.user_id and not current_user.is_admin:
            raise HTTPException(status_code=403, detail="Only owner can confirm received books")

        severity = (damage_severity or "none").lower()
        if severity not in {"none", "light", "medium", "severe"}:
            raise HTTPException(status_code=400, detail="Invalid damage_severity")

        # Order lifecycle: always advance to COMPLETED. Deposit lifecycle is tracked separately.
        order.status = "COMPLETED"
        order.completed_at = datetime.now(timezone.utc)

        # Restore book availability for borrow orders
        if order.action_type == "borrow":
            for order_book in order.books:
                if order_book.book:
                    book = db.query(Book).filter(Book.id == order_book.book_id).first()
                    if book and book.status == "lent":
                        book.status = "listed"

        # Deferred imports to avoid circular refs
        from models.deposit_evidence import DepositEvidence
        from models.deposit_audit_log import DepositAuditLog
        import json

        if severity == "none":
            # Clean return → auto release
            order.deposit_status = "released"
            order.deposit_deducted_cents = 0
            order.damage_severity_final = "none"

            NotificationService.create(
                db, user_id=order.borrower_id, order_id=order.id,
                type="COMPLETED",
                title="Order Completed",
                message="The lender has confirmed receipt of the returned book. Your deposit refund will be processed.",
                commit=False,
            )
            NotificationService.create(
                db, user_id=order.owner_id, order_id=order.id,
                type="COMPLETED",
                title="Order Completed",
                message="You have confirmed receipt of the returned book. Order is now complete.",
                commit=False,
            )

            db.add(DepositAuditLog(
                order_id=order.id,
                actor_id=order.owner_id,
                actor_role="lender",
                action="release",
                amount_cents=0,
                final_severity="none",
                note="Clean return confirmed by lender.",
            ))

            db.commit()
            db.refresh(order)

            # Trigger refund (existing flow)
            if order.payment_id:
                try:
                    refund_data = {"reason": "Books returned and received"}
                    from services.payment_gateway_service import refund_payment
                    refund_payment(order.payment_id, refund_data, db=db)
                except Exception as e:
                    print(f"[WARN] refund_payment failed: {e}")
        else:
            # Damaged return → lender evidence on record, admin arbitrates later
            order.deposit_status = "pending_review"
            order.damage_severity_final = None  # cleared until admin rules

            db.add(DepositEvidence(
                order_id=order.id,
                submitter_id=order.owner_id,
                submitter_role="lender",
                photos=json.dumps(evidence_photos or []),
                claimed_severity=severity,
                note=note,
            ))
            db.add(DepositAuditLog(
                order_id=order.id,
                actor_id=order.owner_id,
                actor_role="lender",
                action="evidence_submitted",
                final_severity=severity,
                note=(note or "").strip() or f"Lender reported damage: {severity}",
            ))

            NotificationService.create(
                db, user_id=order.borrower_id, order_id=order.id,
                type="DEPOSIT_UPDATED",
                title="Damage Reported — Admin Review Pending",
                message=(
                    f"The lender reported damage (severity: {severity}) to the returned book. "
                    "An admin will review and decide the deposit deduction. "
                    "You can upload counter-evidence within 7 days if you disagree."
                ),
                commit=False,
            )
            NotificationService.create(
                db, user_id=order.owner_id, order_id=order.id,
                type="DEPOSIT_UPDATED",
                title="Damage Report Submitted",
                message=(
                    f"Your damage report (severity: {severity}) has been recorded. "
                    "An admin will review the evidence and determine the deduction."
                ),
                commit=False,
            )

            db.commit()
            db.refresh(order)
            # NO automatic refund — admin will trigger partial/full via /deposits/admin endpoints

        return True
