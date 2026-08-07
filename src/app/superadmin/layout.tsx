import { SuperadminNav } from "./superadmin-nav";

export default function SuperadminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-brand-crema">
      <SuperadminNav />
      <div className="mx-auto max-w-6xl px-6 py-10">{children}</div>
    </div>
  );
}
