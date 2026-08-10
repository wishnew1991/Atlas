"use client";

import { AssistantHome } from "@/components/atlas/assistant-home";
import { useSession } from "@/lib/auth-client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function AtlasHomeShell({ mode }: { mode: "home" | "chat" }) {
  const { data: session, isPending } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!isPending && !session) {
      router.push("/sign-in");
    }
  }, [isPending, session, router]);

  if (isPending || !session) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-zinc-950 text-zinc-400">
        Loading...
      </div>
    );
  }

  return <AssistantHome mode={mode} userName={session.user.name} />;
}