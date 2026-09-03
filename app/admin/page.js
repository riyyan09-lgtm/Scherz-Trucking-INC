import AdminDashboard from "./AdminDashboard";
import RegisterSW from "./RegisterSW";

export const dynamic = "force-dynamic";
export const viewport = {
  themeColor: "#0B0E14",
};

export const metadata = {
  title: { absolute: "Scherz Trucking INC Admin" },
  manifest: "/manifest.json",
  robots: { index: false, follow: false },
  appleWebApp: {
    capable: true,
    title: "Scherz Trucking INC",
    statusBarStyle: "black-translucent",
  },
};

export default function AdminPage() {
  return (
    <>
      <RegisterSW />
      <AdminDashboard />
    </>
  );
}

