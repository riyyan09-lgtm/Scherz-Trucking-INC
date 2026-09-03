import { businessMetadata, BusinessSegmentPage } from "../businessPage";
export const dynamic = "force-dynamic";

export const metadata = businessMetadata("fleet");

export default function Page() {
  return <BusinessSegmentPage slug="fleet" />;
}
