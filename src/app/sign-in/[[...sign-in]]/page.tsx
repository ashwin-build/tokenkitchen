import { SignIn } from "@clerk/nextjs";

export const dynamic = "force-dynamic";

export default function SignInPage() {
  const clerkConfigured = Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY,
  );

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      {clerkConfigured ? (
        <SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" forceRedirectUrl="/dashboard" />
      ) : (
        <section className="max-w-md rounded-md border border-[#14302a]/15 bg-white p-6">
          <h1 className="text-xl font-semibold text-[#14302a]">Authentication is not configured</h1>
          <p className="mt-3 text-sm leading-6 text-[#66736d]">
            Add your Clerk publishable and secret keys to `.env`, then restart the development server.
          </p>
        </section>
      )}
    </main>
  );
}