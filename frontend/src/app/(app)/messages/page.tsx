import { redirect } from "next/navigation";

export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ conversation?: string }> }) {
  const { conversation } = await searchParams;
  const target = conversation
    ? `/community?tab=messages&conversation=${encodeURIComponent(conversation)}`
    : "/community?tab=messages";
  redirect(target);
}
