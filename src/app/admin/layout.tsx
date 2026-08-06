import { AdminNav } from "./admin-nav";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-brand-crema">
      <AdminNav />
      <div className="mx-auto max-w-6xl px-6 py-10">{children}</div>
    </div>
  );
}
