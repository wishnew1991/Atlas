export type ActivityTimelineStep = {
  id: string;
  label: string;
  state: "done" | "current" | "upcoming";
};

export type ActivityReceiptField = {
  label: string;
  value: string;
};

export type ActivityAction = {
  id: "order_again" | "track" | "open_chat";
  label: string;
  enabled: boolean;
};

export type ActivityAccomplishment = {
  id: string;
  domain: string;
  title: string;
  headlineStatus: string;
  statusTone: "green" | "amber" | "red" | "blue";
  summary: string;
  orderNumber?: string;
  receipt: ActivityReceiptField[];
  timeline: ActivityTimelineStep[];
  actions: ActivityAction[];
  createdAt: string;
  completedAt?: string;
};
