import { SignUp } from "@clerk/nextjs";
import { notFound } from "next/navigation";

export default function SignUpPage() {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    notFound();
  }

  return <SignUp />;
}
