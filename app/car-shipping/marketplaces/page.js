import { businessMetadata, BusinessSegmentPage } from "../businessPage";
export const dynamic = "force-dynamic";

export const metadata = businessMetadata("marketplaces");

export default function Page() {
  return <BusinessSegmentPage slug="marketplaces" />;
}
