import CrmPortal from "./CrmPortal";

export const dynamic = "force-dynamic";
export const metadata = {
  title: { absolute: "Scherz Trucking INC CRM" },
  robots: { index: false, follow: false },
};

export default function CrmPage() {
  return <CrmPortal />;
}
