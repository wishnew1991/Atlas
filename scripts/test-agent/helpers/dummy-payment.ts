export type PaymentStatus =
  | "created"
  | "pending"
  | "success"
  | "failed"
  | "cancelled"
  | "refunded";

export type PaymentScenario =
  | "success"
  | "pending_then_success"
  | "failure"
  | "user_cancelled"
  | "timeout"
  | "network_error"
  | "duplicate"
  | "idempotent_retry"
  | "delayed_webhook";

export interface PaymentSession {
  paymentId: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  scenario: PaymentScenario;
  createdAt: number;
  updatedAt: number;
  attempts: number;
  webhookSent: boolean;
  webhookDelayed: boolean;
  metadata: Record<string, unknown>;
}

export class DummyPaymentProvider {
  private sessions = new Map<string, PaymentSession>();
  private idCounter = 0;
  private defaultScenario: PaymentScenario = "success";

  setDefaultScenario(scenario: PaymentScenario): this {
    this.defaultScenario = scenario;
    return this;
  }

  createPayment(amount: number, currency = "INR", scenario?: PaymentScenario): PaymentSession {
    const paymentId = `pay_${String(++this.idCounter).padStart(6, "0")}`;
    const session: PaymentSession = {
      paymentId,
      amount,
      currency,
      status: "created",
      scenario: scenario ?? this.defaultScenario,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      attempts: 0,
      webhookSent: false,
      webhookDelayed: false,
      metadata: {},
    };
    this.sessions.set(paymentId, session);
    return { ...session };
  }

  checkStatus(paymentId: string): PaymentSession | null {
    const session = this.sessions.get(paymentId);
    if (!session) return null;

    if (session.scenario === "timeout") {
      throw new Error("Payment provider timed out");
    }
    if (session.scenario === "network_error") {
      throw new Error("Network error connecting to payment provider");
    }

    this.applyScenarioTransition(session);
    return { ...session };
  }

  confirmPayment(paymentId: string): PaymentSession | null {
    const session = this.sessions.get(paymentId);
    if (!session) return null;

    session.attempts += 1;

    if (session.scenario === "idempotent_retry" && session.attempts > 1) {
      session.status = "success";
      session.updatedAt = Date.now();
      return { ...session };
    }

    if (session.scenario === "duplicate" && session.attempts > 1) {
      session.status = "failed";
      session.updatedAt = Date.now();
      return { ...session };
    }

    this.applyScenarioTransition(session);
    return { ...session };
  }

  cancelPayment(paymentId: string): PaymentSession | null {
    const session = this.sessions.get(paymentId);
    if (!session) return null;

    session.status = "cancelled";
    session.updatedAt = Date.now();
    return { ...session };
  }

  fireWebhook(paymentId: string): PaymentSession | null {
    const session = this.sessions.get(paymentId);
    if (!session) return null;

    session.webhookSent = true;
    session.updatedAt = Date.now();
    return { ...session };
  }

  resolveScenario(scenario: PaymentScenario): PaymentStatus {
    switch (scenario) {
      case "success":
      case "idempotent_retry":
        return "success";
      case "pending_then_success":
        return "pending";
      case "failure":
      case "duplicate":
        return "failed";
      case "user_cancelled":
        return "cancelled";
      case "timeout":
      case "network_error":
        return "created";
      case "delayed_webhook":
        return "pending";
    }
  }

  private applyScenarioTransition(session: PaymentSession): void {
    switch (session.scenario) {
      case "success":
        session.status = "success";
        break;
      case "pending_then_success":
        session.status = session.status === "created" ? "pending" : "success";
        break;
      case "failure":
        session.status = "failed";
        break;
      case "delayed_webhook":
        session.status = "pending";
        session.webhookDelayed = true;
        break;
    }
    session.updatedAt = Date.now();
  }

  reset(): void {
    this.sessions.clear();
    this.idCounter = 0;
  }

  getAllSessions(): PaymentSession[] {
    return Array.from(this.sessions.values()).map((s) => ({ ...s }));
  }
}

export const dummyPaymentProvider = new DummyPaymentProvider();
