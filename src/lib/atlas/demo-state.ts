import {
  activeTasks,
  activityTimeline,
  connectedAccounts,
  memoryGroups,
  notifications,
  privacyControls,
  walletRows,
} from "./content";
import { shoppingIntent, shoppingRecommendations, type ShoppingFlowStage } from "./shopping";

export interface AtlasTaskItem {
  id: string;
  title: string;
  body: string;
  meta: string;
}

export interface AtlasActivityItem {
  id: string;
  time: string;
  title: string;
  body: string;
}

export interface AtlasNotificationItem {
  id: string;
  title: string;
  body: string;
  action: string;
}

export interface AtlasDemoState {
  shoppingIntent: string;
  shoppingStage: ShoppingFlowStage;
  selectedShoppingId: string;
  tasks: AtlasTaskItem[];
  activity: AtlasActivityItem[];
  notifications: AtlasNotificationItem[];
  memoryGroups: typeof memoryGroups;
  walletRows: typeof walletRows;
  connectedAccounts: typeof connectedAccounts;
  privacyControls: typeof privacyControls;
}

export const atlasShoppingTaskId = "shopping-task";

function cloneMemoryGroups() {
  return memoryGroups.map((group) => ({
    ...group,
    items: [...group.items],
  }));
}

function cloneActivity() {
  return activityTimeline.map((item, index) => ({
    id: `activity-${index}`,
    time: item.time,
    title: item.title,
    body: item.body,
  }));
}

function cloneNotifications() {
  return notifications.map((item, index) => ({
    id: `notification-${index}`,
    title: item.title,
    body: item.body,
    action: item.action,
  }));
}

function cloneTasks() {
  return activeTasks.map((task, index) => ({
    id: `task-${index}`,
    title: task.title,
    body: task.body,
    meta: task.meta ?? "Active",
  }));
}

function cloneWalletRows() {
  return walletRows.map((row) => ({ ...row }));
}

function cloneConnectedAccounts() {
  return connectedAccounts.map((row) => ({ ...row }));
}

function clonePrivacyControls() {
  return privacyControls.map((row) => ({ ...row }));
}

export function createInitialAtlasDemoState(): AtlasDemoState {
  return {
    shoppingIntent,
    shoppingStage: "idle",
    selectedShoppingId: shoppingRecommendations[0]?.id ?? "shopping-default",
    tasks: cloneTasks(),
    activity: cloneActivity(),
    notifications: cloneNotifications(),
    memoryGroups: cloneMemoryGroups(),
    walletRows: cloneWalletRows(),
    connectedAccounts: cloneConnectedAccounts(),
    privacyControls: clonePrivacyControls(),
  };
}

export function cloneAtlasDemoState(state: AtlasDemoState): AtlasDemoState {
  return {
    shoppingIntent: state.shoppingIntent,
    shoppingStage: state.shoppingStage,
    selectedShoppingId: state.selectedShoppingId,
    tasks: state.tasks.map((task) => ({ ...task })),
    activity: state.activity.map((item) => ({ ...item })),
    notifications: state.notifications.map((item) => ({ ...item })),
    memoryGroups: state.memoryGroups.map((group) => ({
      ...group,
      items: [...group.items],
    })),
    walletRows: state.walletRows.map((row) => ({ ...row })),
    connectedAccounts: state.connectedAccounts.map((row) => ({ ...row })),
    privacyControls: state.privacyControls.map((row) => ({ ...row })),
  };
}

export function findShoppingProductLabel(selectedShoppingId: string) {
  return (
    shoppingRecommendations.find((item) => item.id === selectedShoppingId)?.title ??
    shoppingRecommendations[0]?.title ??
    "Selected product"
  );
}

