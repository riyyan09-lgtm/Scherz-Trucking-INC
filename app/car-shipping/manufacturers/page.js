import { businessMetadata, BusinessSegmentPage } from "../businessPage";
export const dynamic = "force-dynamic";

export const metadata = businessMetadata("manufacturers");

export default function Page() {
  return <BusinessSegmentPage slug="manufacturers" />;
}
