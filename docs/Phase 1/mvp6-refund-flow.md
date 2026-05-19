# MVP6 Automated Refund Handling - Flow Diagrams

## 1. Overall Refund System Architecture

```mermaid
flowchart TB
    subgraph Triggers["Refund Trigger Sources"]
        T1["Scheduler: Every 1h<br/>auto_refund_unshipped_orders"]
        T2["Scheduler: Every 24h<br/>auto_cancel_failed_payments"]
        T3["User Action<br/>POST /refund/cancel/{order_id}"]
        T4["Stripe Webhook<br/>payment_intent.canceled"]
        T5["Order Completed<br/>refund_deposit_for_order"]
    end

    subgraph Processing["Refund Processing Layer"]
        P1["Determine refund amount<br/>(deposit / shipping / full)"]
        P2["Call Stripe Refund API<br/>stripe.Refund.create()"]
        P3["Save Refund record to DB"]
        P4["Update Payment status<br/>(refunded / partially_refunded)"]
        P5["Update Order status<br/>(CANCELED / COMPLETED)"]
        P6["Restore book status<br/>to 'listed'"]
        P7["Write AuditLog"]
        P8["Send system notification<br/>to borrower/owner"]
    end

    subgraph Webhook["Stripe Webhook Callbacks"]
        W1["refund.updated<br/>Sync Refund.status in DB"]
        W2["refund.failed<br/>Log + mark for retry"]
    end

    subgraph Frontend["Frontend Display"]
        F1["Order Detail Page<br/>Refund Status Section"]
        F2["Notification Bell<br/>Refund Messages"]
    end

    T1 --> P1
    T2 --> P5
    T3 --> P1
    T4 --> P5
    T5 --> P1

    P1 --> P2
    P2 --> P3
    P3 --> P4
    P4 --> P5
    P5 --> P6
    P6 --> P7
    P7 --> P8

    P2 -.->|Stripe async callback| W1
    P2 -.->|Stripe async callback| W2

    P3 -->|GET /refunds/{order_id}| F1
    P8 -->|WebSocket + REST| F2
```

## 2. Scenario A: Auto Refund Unshipped Orders (Scheduled)

```mermaid
flowchart TD
    Start(["Scheduler triggers<br/>every 1 hour"]) --> Query["Query orders WHERE<br/>status = PENDING_SHIPMENT<br/>AND created_at < 3 days ago<br/>AND no tracking number"]

    Query --> Found{Orders found?}
    Found -->|No| End1(["Done - no action"])
    Found -->|Yes| Loop["For each order"]

    Loop --> GetSplit["Get PaymentSplit<br/>for order"]
    GetSplit --> CalcAmount["Calculate refund amount<br/>= deposit_cents + shipping_cents"]

    CalcAmount --> HasAmount{amount > 0?}
    HasAmount -->|No| Skip["Skip this order"]
    HasAmount -->|Yes| StripeRefund["stripe.Refund.create(<br/>payment_intent, amount)"]

    StripeRefund --> Success{Stripe success?}
    Success -->|Error| LogError["Log error to AuditLog<br/>continue to next order"]
    Success -->|Yes| SaveRefund["Save Refund record to DB"]

    SaveRefund --> CancelOrder["Order.status = CANCELED<br/>Order.canceled_at = now"]
    CancelOrder --> RestoreBooks["Restore all books<br/>status -> 'listed'"]
    RestoreBooks --> Audit["Write AuditLog<br/>actor = 'system'"]
    Audit --> Notify["Send notification to borrower:<br/>'Order cancelled: lender did not<br/>ship within 3 days'<br/><br/>Send notification to owner:<br/>'Your order was cancelled due to<br/>no shipment within 3 days'"]

    Notify --> Next["Next order"]
    Skip --> Next
    LogError --> Next
    Next --> Loop
    Next --> Commit["db.commit()"]
    Commit --> End2(["Done"])
```

## 3. Scenario B: Auto Cancel Failed Payments (Scheduled)

```mermaid
flowchart TD
    Start(["Scheduler triggers<br/>every 24 hours"]) --> Query["Query payments WHERE<br/>status IN ('failed',<br/>'requires_payment_method')"]

    Query --> Found{Payments found?}
    Found -->|No| End1(["Done"])
    Found -->|Yes| Loop["For each payment"]

    Loop --> FindOrders["Find orders WHERE<br/>payment_id = this payment<br/>AND status = PENDING_PAYMENT"]

    FindOrders --> HasOrders{Orders found?}
    HasOrders -->|No| NextPay["Next payment"]
    HasOrders -->|Yes| OrderLoop["For each order"]

    OrderLoop --> Cancel["Order.status = CANCELED<br/>Order.canceled_at = now"]
    Cancel --> Restore["Restore books -> 'listed'"]
    Restore --> Audit["Write AuditLog"]
    Audit --> Notify["Notify borrower:<br/>'Payment failed, order cancelled'"]
    Notify --> NextOrder["Next order"]
    NextOrder --> OrderLoop

    NextPay --> Loop
    NextOrder --> NextPay
    NextPay --> Commit["db.commit()"]
    Commit --> End2(["Done<br/>No Stripe refund needed<br/>(money was never captured)"])
```

## 4. Scenario C: User Cancels Order (Immediate)

```mermaid
flowchart TD
    Start(["User clicks<br/>'Cancel Order'"]) --> API["POST /payment_gateway/<br/>payment/refund/cancel/{order_id}"]

    API --> Auth["Verify user authorization<br/>(borrower or admin only)"]
    Auth --> CheckStatus{"Order status =<br/>PENDING_SHIPMENT?"}

    CheckStatus -->|No| Error1["400: Order cannot<br/>be cancelled"]
    CheckStatus -->|Yes| GetSplit["Get PaymentSplit"]

    GetSplit --> Found{Split found?}
    Found -->|No| Error2["404: Payment split<br/>not found"]
    Found -->|Yes| CalcAmount["refund_amount =<br/>deposit_cents + shipping_cents"]

    CalcAmount --> StripeCall["stripe.Refund.create(<br/>payment_intent=sp.payment_id,<br/>amount=refund_amount)"]

    StripeCall --> StripeOK{Success?}
    StripeOK -->|charge_already_refunded| Idempotent["Return existing<br/>refund info (idempotent)"]
    StripeOK -->|Other error| Error3["Return Stripe<br/>error details"]
    StripeOK -->|Yes| SaveDB["Save Refund record<br/>Update Payment status"]

    SaveDB --> CancelOrder["cancel_order()<br/>Order -> CANCELED<br/>Books -> 'listed'"]
    CancelOrder --> Audit["Write AuditLog<br/>actor = user_id"]
    Audit --> Notify["Notify borrower:<br/>'Your refund of $X<br/>is being processed'"]
    Notify --> Response["Return {refund_id,<br/>amount, status}"]

    Response --> Webhook(["Later: Stripe webhook<br/>refund.updated -> succeeded<br/>-> Notify: 'Refund completed'"])
```

## 5. Complete Order Lifecycle with Refund Points

```mermaid
stateDiagram-v2
    [*] --> PENDING_PAYMENT: Checkout created

    PENDING_PAYMENT --> PENDING_SHIPMENT: payment_intent.succeeded<br/>(webhook)
    PENDING_PAYMENT --> CANCELED: Auto cancel<br/>(payment failed, daily check)

    PENDING_SHIPMENT --> BORROWING: Owner ships + start_at reached<br/>(hourly scheduler)
    PENDING_SHIPMENT --> CANCELED: User cancels → full refund<br/>OR auto refund (3-day timeout)

    BORROWING --> OVERDUE: due_at passed<br/>(hourly scheduler)
    BORROWING --> RETURNED: Borrower confirms return shipment

    OVERDUE --> RETURNED: Borrower returns (late)

    RETURNED --> COMPLETED: Owner confirms received<br/>OR auto-complete<br/>→ deposit refund

    CANCELED --> [*]
    COMPLETED --> [*]

    note right of CANCELED
        Refund scenarios:
        - PENDING_PAYMENT: no Stripe refund needed
        - PENDING_SHIPMENT: full refund (deposit + shipping)
    end note

    note right of COMPLETED
        Borrow completion:
        - Deposit refunded to borrower
        - Books restored to 'listed'
    end note
```

## 6. Webhook Event Handling Flow

```mermaid
flowchart LR
    Stripe["Stripe Server"] -->|POST /webhook| Endpoint["stripe_webhook()"]

    Endpoint --> Parse["Verify signature<br/>Parse event"]

    Parse --> Switch{event.type?}

    Switch -->|payment_intent.succeeded| A["Update Payment -> succeeded<br/>Create Orders<br/>Confirm payment"]
    Switch -->|payment_intent.payment_failed| B["Update Payment -> failed<br/>Log event"]
    Switch -->|payment_intent.canceled| C["Find related orders<br/>Set -> CANCELED<br/>Log event"]
    Switch -->|charge.refunded| D["Update Refund.status<br/>in DB"]
    Switch -->|refund.updated| E["Sync Refund.status<br/>Notify user if succeeded"]
    Switch -->|refund.failed| F["Log AuditLog<br/>Mark for retry<br/>Notify: 'Refund failed'"]

    style C fill:#ffd700,stroke:#333
    style E fill:#ffd700,stroke:#333
    style F fill:#ffd700,stroke:#333
```

> Yellow nodes = NEW webhook handlers added in MVP6

## 7. Development Task Dependency

```mermaid
gantt
    title MVP6 Development Order
    dateFormat X
    axisFormat %s

    section Backend
    B1 Refund Logic (3 functions + fix sa_func)  :b1, 0, 3
    B2 Stripe API + New Endpoints                :b2, after b1, 2
    B3 Scheduler Jobs + Webhook Enhancement      :b3, after b2, 1

    section Testing
    API Testing via /docs                        :test, after b3, 1

    section Frontend
    F1 Refund Status UI                          :f1, after test, 2
    F2 Notification UI                           :f2, after test, 2
```

## 8. Data Flow Between Components

```mermaid
flowchart LR
    subgraph Backend
        Service["payment_gateway_service.py<br/>- auto_refund_unshipped_orders()<br/>- auto_cancel_failed_payments()<br/>- refund_on_cancel()"]
        Routes["payment_gateway.py<br/>- GET /refunds/{order_id}<br/>- POST /refund/cancel/{order_id}"]
        Tasks["tasks.py<br/>- scheduler 1h: unshipped<br/>- scheduler 24h: failed"]
        MsgSvc["message_service.py<br/>- send_system_notification()"]
    end

    subgraph Stripe
        API["Stripe Refund API"]
        WH["Stripe Webhooks"]
    end

    subgraph Frontend
        OrderPage["borrowing/[id]/page.tsx<br/>Refund Status Section"]
        NotifUI["Notification Component<br/>System Messages"]
        PayUtils["payments.ts<br/>getRefundsForOrder()"]
    end

    Tasks -->|calls| Service
    Routes -->|calls| Service
    Service -->|stripe.Refund.create| API
    API -->|async events| WH
    WH -->|POST /webhook| Routes
    Service -->|insert notification| MsgSvc
    MsgSvc -->|WebSocket push| NotifUI
    OrderPage -->|fetch| PayUtils
    PayUtils -->|GET /refunds| Routes
```
