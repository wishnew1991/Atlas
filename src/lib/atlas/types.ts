export type AtlasTabId = "home" | "chat" | "tasks" | "activity" | "profile" | "admin";

export interface AtlasTab {
  id: AtlasTabId;
  label: string;
  href: string;
  icon: string;
  adminOnly?: boolean;
}

export interface AtlasCardData {
  title: string;
  body: string;
  eyebrow?: string;
  badge?: string;
}

export interface AtlasStepData {
  title: string;
  body: string;
}

export interface AtlasRowData {
  title: string;
  body: string;
  meta?: string;
}

export interface AtlasTimelineData {
  time: string;
  title: string;
  body: string;
}
