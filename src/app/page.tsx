import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-6 py-16">
      <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[#d6402b]">TokenKitchen</p>
      <h1 className="mt-5 max-w-2xl text-5xl font-semibold leading-tight text-[#14302a]">
        The counter, kitchen, and books in one place.
      </h1>
      <p className="mt-5 max-w-xl text-lg leading-8 text-[#66736d]">
        Sign in to open your restaurant workspace or create a business account.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link className="rounded-md bg-[#14302a] px-5 py-3 font-semibold text-white" href="/sign-up">
          Create account
        </Link>
        <Link className="rounded-md border border-[#14302a]/20 px-5 py-3 font-semibold text-[#14302a]" href="/sign-in">
          Sign in
        </Link>
      </div>
    </main>
  );
}