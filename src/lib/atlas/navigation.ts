import type { AtlasTab } from "./types";

export const atlasTabs: AtlasTab[] = [
  { id: "home", label: "Home", href: "/", icon: "home" },
  { id: "chat", label: "Chat", href: "/chat", icon: "chat" },
  { id: "tasks", label: "Tasks", href: "/tasks", icon: "tasks" },
  { id: "activity", label: "Activity", href: "/activity", icon: "activity" },
  { id: "profile", label: "Profile", href: "/profile", icon: "profile" },
  { id: "admin", label: "Admin", href: "/admin", icon: "profile", adminOnly: true },
];
