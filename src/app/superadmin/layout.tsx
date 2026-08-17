import { SuperadminNav } from "./superadmin-nav";

export default function SuperadminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col md:flex-row bg-brand-crema">
      <SuperadminNav />
      <main className="flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
