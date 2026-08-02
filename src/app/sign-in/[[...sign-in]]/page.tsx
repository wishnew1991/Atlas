import { SignIn } from "@clerk/nextjs";
import { notFound } from "next/navigation";

export default function SignInPage() {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    notFound();
  }

  return <SignIn />;
}
