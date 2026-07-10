import { requireSession } from "@/lib/auth";
import { fetchChatMessages } from "@/actions/chat";
import { ChatRoom } from "@/components/chat-room";

export const dynamic = "force-dynamic";

export default async function ChatPage() {
  const session = await requireSession();
  const initial = await fetchChatMessages();
  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-xl font-bold">💬 Team Chat</h1>
        <p className="text-sm text-slate-500">Company-wide chat for the whole team. Type @name to notify someone, @all for everyone.</p>
      </div>
      <ChatRoom meId={session.userId} initial={initial} />
    </div>
  );
}
