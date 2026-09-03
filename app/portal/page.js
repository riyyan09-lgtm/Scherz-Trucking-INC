import TenantPortal from "./TenantPortal";
export const dynamic = "force-dynamic";

export const metadata = {
  title: { absolute: "Scherz Trucking INC Tenant Portal" },
  robots: { index: false, follow: false },
};

export default function PortalPage() {
  return <TenantPortal />;
}
