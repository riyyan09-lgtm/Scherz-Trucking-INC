import { businessMetadata, BusinessSegmentPage } from "../businessPage";
export const dynamic = "force-dynamic";

export const metadata = businessMetadata("relocation");

export default function Page() {
  return <BusinessSegmentPage slug="relocation" />;
}
