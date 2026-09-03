import { businessMetadata, BusinessSegmentPage } from "../businessPage";
export const dynamic = "force-dynamic";

export const metadata = businessMetadata("repair-shops");

export default function Page() {
  return <BusinessSegmentPage slug="repair-shops" />;
}
