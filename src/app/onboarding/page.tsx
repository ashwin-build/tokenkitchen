import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { createBusinessAction } from "@/server/auth/business-actions";
import { membershipsForClerkUser } from "@/server/db/membership-access";

export const dynamic = "force-dynamic";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const memberships = await membershipsForClerkUser(userId);
  if (memberships.length > 0) redirect("/dashboard");

  const { error } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6 py-12">
      <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[#d6402b]">First, your business</p>
      <h1 className="mt-3 text-3xl font-semibold text-[#14302a]">Set up your restaurant workspace</h1>
      <p className="mt-3 text-[#66736d]">Your 14-day trial starts when the workspace is created.</p>
      {error ? <p className="mt-5 text-sm font-medium text-[#d6402b]">Enter a valid business name and account email to continue.</p> : null}
      <form action={createBusinessAction} className="mt-8 space-y-4">
        <label className="block text-sm font-semibold text-[#18231f]" htmlFor="businessName">
          Business name
        </label>
        <input
          className="min-h-12 w-full rounded-md border border-[#14302a]/20 bg-white px-4 outline-none focus:border-[#14302a]"
          id="businessName"
          name="businessName"
          autoComplete="organization"
          maxLength={80}
          required
        />
        <button className="min-h-12 rounded-md bg-[#14302a] px-5 font-semibold text-white" type="submit">
          Create workspace
        </button>
      </form>
    </main>
  );
}