"use client";

export default function GlobalError({ error: _error, reset }: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  void _error;
  return (
    <html lang="en">
      <body>
        <main>
          <h1>Something went wrong</h1>
          <p>We could not complete that request. Please try again.</p>
          <button type="button" onClick={reset}>Try again</button>
        </main>
      </body>
    </html>
  );
}
