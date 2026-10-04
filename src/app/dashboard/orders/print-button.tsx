"use client";

export function PrintButton({ children }: { children: React.ReactNode }) {
  return <button className="tk-button-primary no-print" onClick={() => window.print()} type="button">{children}</button>;
}