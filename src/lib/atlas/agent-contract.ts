export type AtlasChatRole = "assistant" | "user";

export type AtlasActionDomain =
  | "shopping"
  | "travel"
  | "food"
  | "rides"
  | "appointments";

export interface AtlasChatHistoryItem {
  role: AtlasChatRole;
  text: string;
}

export interface AtlasApprovalField {
  label: string;
  value: string;
}

export interface AtlasPendingAction {
  id: string;
  domain: AtlasActionDomain;
  title: string;
  summary: string;
  approvalLabel: string;
  fields: AtlasApprovalField[];
}

export interface AtlasChatResponse {
  reply: string;
  mode: "live" | "demo";
  toolsUsed: string[];
  action?: AtlasPendingAction;
}

export interface AtlasActionResponse {
  message: string;
  reference: string;
  mode: "live" | "demo";
  /**
   * True when the action is awaiting an external step (e.g. UPI payment) and is
   * NOT complete. The approval stays pending and must not be reported as done.
   */
  pending?: boolean;
  /** UPI app deep-link the client should open to finish payment. */
  upiRedirect?: string;
  /** UPI QR payload the client should render for the user to scan. */
  upiQr?: string;
}
