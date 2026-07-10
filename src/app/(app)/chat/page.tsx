import { requireSession } from "@/lib/auth";
import { listChatPeers } from "@/actions/chat";
import { isStorageConfigured } from "@/lib/storage";
import { ChatRoom } from "@/components/chat-room";

export const dynamic = "force-dynamic";

export default async function ChatPage() {
  const session = await requireSession();
  const peers = await listChatPeers();
  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-xl font-bold">💬 Team Chat</h1>
        <p className="text-sm text-slate-500">Team channel for everyone, plus 1-on-1 direct messages. @name to notify someone, @all for everyone. 📷 to send a photo.</p>
      </div>
      <ChatRoom meId={session.userId} peers={peers} storageReady={isStorageConfigured()} />
    </div>
  );
}
