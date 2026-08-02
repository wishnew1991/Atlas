"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import {
  atlasShoppingTaskId,
  createInitialAtlasDemoState,
  findShoppingProductLabel,
  type AtlasActivityItem,
  type AtlasDemoState,
  type AtlasNotificationItem,
  type AtlasTaskItem,
} from "@/lib/atlas/demo-state";
import { shoppingRecommendations, type ShoppingFlowStage } from "@/lib/atlas/shopping";

type AtlasDemoContextValue = AtlasDemoState & {
  startShopping: () => void;
  setShoppingStage: (stage: ShoppingFlowStage) => void;
  selectShoppingRecommendation: (recommendationId: string) => void;
  resetShopping: () => void;
  toggleConnectedAccount: (accountTitle: string) => void;
  togglePrivacyControl: (controlTitle: string) => void;
  dismissNotification: (notificationId: string) => void;
};

const AtlasDemoContext = createContext<AtlasDemoContextValue | null>(null);

function nextToggleValue(value: string) {
  if (value === "Enabled") {
    return "Disabled";
  }

  if (value === "Disabled") {
    return "Enabled";
  }

  if (value === "Connected") {
    return "Paused";
  }

  if (value === "Paused") {
    return "Connected";
  }

  if (value === "Limited") {
    return "Expanded";
  }

  if (value === "Expanded") {
    return "Limited";
  }

  return value;
}

function upsertTask(tasks: AtlasTaskItem[], nextTask: AtlasTaskItem) {
  const index = tasks.findIndex((task) => task.id === nextTask.id);

  if (index === -1) {
    return [nextTask, ...tasks];
  }

  const nextTasks = [...tasks];
  nextTasks[index] = nextTask;
  return nextTasks;
}

function upsertNotification(notifications: AtlasNotificationItem[], nextNotification: AtlasNotificationItem) {
  const index = notifications.findIndex((item) => item.id === nextNotification.id);

  if (index === -1) {
    return [nextNotification, ...notifications];
  }

  const nextNotifications = [...notifications];
  nextNotifications[index] = nextNotification;
  return nextNotifications;
}

function prependActivity(activity: AtlasActivityItem[], nextActivity: AtlasActivityItem) {
  return [nextActivity, ...activity];
}

function updateShoppingMemory(state: AtlasDemoState, selectedShoppingId: string) {
  const selectedTitle = findShoppingProductLabel(selectedShoppingId);

  return state.memoryGroups.map((group) => {
    if (group.title !== "Shopping preferences") {
      return group;
    }

    if (group.items.includes(selectedTitle)) {
      return group;
    }

    return {
      ...group,
      items: [selectedTitle, ...group.items],
    };
  });
}

function shoppingTaskMeta(stage: ShoppingFlowStage) {
  switch (stage) {
    case "searching":
      return "Searching";
    case "review":
      return "Reviewing";
    case "approval":
      return "Awaiting approval";
    case "executing":
      return "Processing";
    case "complete":
      return "Complete";
    default:
      return "Ready";
  }
}

function shoppingTaskBody(stage: ShoppingFlowStage, selectedTitle: string) {
  switch (stage) {
    case "searching":
      return "Atlas is searching providers and comparing options.";
    case "review":
      return "Atlas is ranking the best options before asking for approval.";
    case "approval":
      return `Selected recommendation: ${selectedTitle}. Waiting for approval.`;
    case "executing":
      return `Fewsats MCP is settling payment for ${selectedTitle}.`;
    case "complete":
      return `${selectedTitle} is confirmed. Receipt and tracking are stored in Activity.`;
    default:
      return "Atlas will update this task once the search begins.";
  }
}

function shoppingActivityCopy(stage: ShoppingFlowStage, selectedTitle: string) {
  switch (stage) {
    case "searching":
      return {
        time: "Now",
        title: "Atlas is searching providers",
        body: "Discovery is running across commerce surfaces before any recommendation is shown.",
      };
    case "review":
      return {
        time: "Next",
        title: "Atlas is comparing recommendations",
        body: `The strongest options for ${selectedTitle} are being ranked by price, policy, and delivery.`,
      };
    case "approval":
      return {
        time: "Approval",
        title: "Atlas is waiting for approval",
        body: `The final amount, payment method, and return policy are visible before Atlas continues.`,
      };
    case "executing":
      return {
        time: "Executing",
        title: "Atlas is settling the purchase",
        body: "Payment is being processed through the controlled wallet layer.",
      };
    case "complete":
      return {
        time: "Complete",
        title: "Atlas completed the task",
        body: `${selectedTitle} is secured and the result is now tracked inside Atlas.`,
      };
    default:
      return {
        time: "Ready",
        title: "Atlas is waiting for a request",
        body: "Start a conversation and Atlas will begin the control loop.",
      };
  }
}

function shoppingNotificationCopy(stage: ShoppingFlowStage, selectedTitle: string) {
  switch (stage) {
    case "searching":
      return {
        id: "shopping-status",
        title: "Searching shopping providers",
        body: "Atlas is comparing product coverage and deal quality.",
        action: "View progress",
      };
    case "review":
      return {
        id: "shopping-status",
        title: "Recommendation ready",
        body: `${selectedTitle} is the current leading option.`,
        action: "Review options",
      };
    case "approval":
      return {
        id: "shopping-status",
        title: "Approval required",
        body: `Atlas will not spend money until you confirm ${selectedTitle}.`,
        action: "Approve now",
      };
    case "executing":
      return {
        id: "shopping-status",
        title: "Purchase processing",
        body: "Atlas is completing the transaction and preparing the receipt.",
        action: "View status",
      };
    case "complete":
      return {
        id: "shopping-status",
        title: "Purchase complete",
        body: `${selectedTitle} is confirmed and being tracked.`,
        action: "Track order",
      };
    default:
      return {
        id: "shopping-status",
        title: "Atlas is ready",
        body: "Start a request to begin searching and comparing.",
        action: "Start",
      };
  }
}

function applyShoppingStage(state: AtlasDemoState, stage: ShoppingFlowStage): AtlasDemoState {
  const selectedTitle = findShoppingProductLabel(state.selectedShoppingId);
  const shoppingTask: AtlasTaskItem = {
    id: atlasShoppingTaskId,
    title: "Shopping task",
    body: shoppingTaskBody(stage, selectedTitle),
    meta: shoppingTaskMeta(stage),
  };
  const activityEntry = shoppingActivityCopy(stage, selectedTitle);
  const notificationEntry = shoppingNotificationCopy(stage, selectedTitle);

  return {
    ...state,
    shoppingStage: stage,
    tasks: upsertTask(state.tasks, shoppingTask),
    activity: prependActivity(state.activity, {
      id: `shopping-${stage}-${Date.now()}`,
      ...activityEntry,
    }),
    notifications: upsertNotification(state.notifications, {
      id: notificationEntry.id,
      title: notificationEntry.title,
      body: notificationEntry.body,
      action: notificationEntry.action,
    }),
    memoryGroups:
      stage === "complete"
        ? updateShoppingMemory(state, state.selectedShoppingId)
        : state.memoryGroups,
  };
}

export function AtlasDemoProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AtlasDemoState>(() => createInitialAtlasDemoState());

  const startShopping = useCallback(() => {
    setState((current) =>
      applyShoppingStage(
        {
          ...current,
          selectedShoppingId: shoppingRecommendations[0]?.id ?? current.selectedShoppingId,
        },
        "searching"
      )
    );
  }, []);

  const setShoppingStage = useCallback((stage: ShoppingFlowStage) => {
    setState((current) => applyShoppingStage(current, stage));
  }, []);

  const selectShoppingRecommendation = useCallback((recommendationId: string) => {
    setState((current) =>
      applyShoppingStage(
        {
          ...current,
          selectedShoppingId: recommendationId,
        },
        "approval"
      )
    );
  }, []);

  const resetShopping = useCallback(() => {
    setState(() => createInitialAtlasDemoState());
  }, []);

  const toggleConnectedAccount = useCallback((accountTitle: string) => {
    setState((current) => ({
      ...current,
      connectedAccounts: current.connectedAccounts.map((account) =>
        account.title === accountTitle
          ? {
              ...account,
              body: nextToggleValue(account.body),
            }
          : account
      ),
    }));
  }, []);

  const togglePrivacyControl = useCallback((controlTitle: string) => {
    setState((current) => ({
      ...current,
      privacyControls: current.privacyControls.map((control) =>
        control.title === controlTitle
          ? { ...control, body: nextToggleValue(control.body) }
          : control
      ),
    }));
  }, []);

  const dismissNotification = useCallback((notificationId: string) => {
    setState((current) => ({
      ...current,
      notifications: current.notifications.filter((item) => item.id !== notificationId),
    }));
  }, []);

  useEffect(() => {
    if (state.shoppingStage !== "searching") {
      return;
    }

    const timer = window.setTimeout(() => {
      setState((current) =>
        current.shoppingStage === "searching" ? applyShoppingStage(current, "review") : current
      );
    }, 1400);

    return () => window.clearTimeout(timer);
  }, [state.shoppingStage]);

  useEffect(() => {
    if (state.shoppingStage !== "executing") {
      return;
    }

    const timer = window.setTimeout(() => {
      setState((current) =>
        current.shoppingStage === "executing" ? applyShoppingStage(current, "complete") : current
      );
    }, 1500);

    return () => window.clearTimeout(timer);
  }, [state.shoppingStage]);

  const value = useMemo<AtlasDemoContextValue>(
    () => ({
      ...state,
      startShopping,
      setShoppingStage,
      selectShoppingRecommendation,
      resetShopping,
      toggleConnectedAccount,
      togglePrivacyControl,
      dismissNotification,
    }),
    [
      dismissNotification,
      resetShopping,
      selectShoppingRecommendation,
      setShoppingStage,
      startShopping,
      state,
      toggleConnectedAccount,
      togglePrivacyControl,
    ]
  );

  return <AtlasDemoContext.Provider value={value}>{children}</AtlasDemoContext.Provider>;
}

export function useAtlasDemo() {
  const context = useContext(AtlasDemoContext);

  if (!context) {
    throw new Error("useAtlasDemo must be used within AtlasDemoProvider");
  }

  return context;
}
