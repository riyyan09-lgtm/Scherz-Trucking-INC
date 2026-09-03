import BookingForm from "./BookingForm";

export const metadata = {
  title: { absolute: "Confirm your vehicle shipment" },
  robots: { index: false, follow: false },
};

export default function BookingPage({ params }) {
  return <BookingForm token={params.token} />;
}
