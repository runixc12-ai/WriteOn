import { PhoneStation } from "../../../components/writeon-phone";
export default async function PhonePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PhoneStation roomId={id} />;
}
