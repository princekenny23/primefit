"use client";

import { FormEvent, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, MessageCircle, Send, UserRound, Users } from "lucide-react";
import { Avatar } from "@/components/product-ui";
import { apiList, apiRequest, ApiCommunityMember, ApiConversation, ApiMember, ApiMessage } from "@/lib/api";
import { CommunityMemberRow } from "@/components/community-members";
import { usePrimeFit } from "@/providers/app-provider";

type FriendRequest = { id: number; sender: ApiMember; receiver: ApiMember };
type FriendData = { incoming: FriendRequest[]; outgoing: FriendRequest[]; friends: ApiMember[] };

export default function MessagesPage() {
  return <Suspense fallback={<div className="page-loading">Loading messages…</div>}><MessagesInbox /></Suspense>;
}

export function MessagesInbox({ embedded = false, section = "messages" }: { embedded?: boolean; section?: "messages" | "friends" }) {
  const { authenticated, notify } = usePrimeFit();
  const router = useRouter();
  const searchParams = useSearchParams();
  const conversationParam = searchParams.get("conversation");
  const [conversations, setConversations] = useState<ApiConversation[]>([]);
  const [friendData, setFriendData] = useState<FriendData>({ incoming: [], outgoing: [], friends: [] });
  const [directory, setDirectory] = useState<ApiCommunityMember[]>([]);
  const [memberTab, setMemberTab] = useState<"online" | "friends" | "requests">("online");
  const [selectedId, setSelectedId] = useState<number | null>(conversationParam ? Number(conversationParam) : null);
  const [loadedMessages, setLoadedMessages] = useState<{ conversationId: number; items: ApiMessage[] } | null>(null);
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    const [conversationData, friends] = await Promise.all([
      apiRequest<ApiConversation[]>("/conversations/"),
      apiRequest<FriendData>("/friends/"),
    ]);
    setConversations(conversationData);
    setFriendData(friends);
    setSelectedId((current) => {
      const requested = conversationParam ? Number(conversationParam) : null;
      if (requested && conversationData.some((item) => item.id === requested)) return requested;
      if (current && conversationData.some((item) => item.id === current)) return current;
      return conversationData[0]?.id ?? null;
    });
  }, [conversationParam]);

  useEffect(() => {
    if (!authenticated) { router.replace(embedded ? "/login?next=/community?tab%3Dmessages" : "/login?next=/messages"); return; }
    let cancelled = false;
    Promise.all([apiRequest<ApiConversation[]>("/conversations/"), apiRequest<FriendData>("/friends/"), apiList<ApiCommunityMember>("/members/")])
      .then(([conversationData, friends, members]) => {
        if (cancelled) return;
        setConversations(conversationData);
        setFriendData(friends);
        setDirectory(members);
        const requested = conversationParam ? Number(conversationParam) : null;
        setSelectedId(requested && conversationData.some((item) => item.id === requested) ? requested : conversationData[0]?.id ?? null);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : embedded ? "Could not load chat." : "Could not load messages.");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [authenticated, conversationParam, embedded, router]);

  useEffect(() => {
    if (!embedded || !authenticated) return;
    let cancelled = false;
    let reportedFailure = false;
    const refreshMembers = () => {
      apiList<ApiCommunityMember>("/members/")
        .then((members) => {
          if (!cancelled) {
            setDirectory(members);
            reportedFailure = false;
          }
        })
        .catch((reason: unknown) => {
          if (!cancelled && !reportedFailure) {
            notify(reason instanceof Error ? reason.message : "Could not refresh online members.");
            reportedFailure = true;
          }
        });
    };
    const timer = window.setInterval(refreshMembers, 60_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [authenticated, embedded, notify]);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    apiRequest<ApiMessage[]>(`/conversations/${selectedId}/messages/`)
      .then((result) => { if (!cancelled) setLoadedMessages({ conversationId: selectedId, items: result }); })
      .catch((reason: unknown) => {
        if (!cancelled) notify(reason instanceof Error ? reason.message : "Could not load this conversation.");
      });
    return () => { cancelled = true; };
  }, [notify, selectedId]);

  const messages = loadedMessages?.conversationId === selectedId ? loadedMessages.items : [];
  const selectedConversation = useMemo(() => conversations.find((item) => item.id === selectedId) ?? null, [conversations, selectedId]);

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedId || !body.trim()) return;
    let message: ApiMessage;
    try {
      message = await apiRequest<ApiMessage>(`/conversations/${selectedId}/messages/`, {
        method: "POST",
        body: JSON.stringify({ body: body.trim() }),
      });
    } catch (reason) { notify(reason instanceof Error ? reason.message : "Could not send this message."); return; }
    setLoadedMessages((current) => ({
      conversationId: selectedId,
      items: current?.conversationId === selectedId ? [...current.items, message] : [message],
    }));
    setBody("");
    try { await refresh(); }
    catch (reason) { notify(reason instanceof Error ? `Message sent, but inbox refresh failed: ${reason.message}` : "Message sent, but the inbox could not refresh."); }
  }

  async function respond(requestId: number, decision: "accept" | "decline") {
    try {
      await apiRequest(`/friends/requests/${requestId}/respond/`, { method: "POST", body: JSON.stringify({ decision }) });
    } catch (reason) { notify(reason instanceof Error ? reason.message : "Could not update friend request."); return; }
    notify(decision === "accept" ? "Friend request accepted." : "Friend request declined.");
    try { await refresh(); }
    catch (reason) { notify(reason instanceof Error ? `Request updated, but inbox refresh failed: ${reason.message}` : "Request updated, but the inbox could not refresh."); }
  }

  async function startConversation(member: ApiMember) {
    try {
      const conversation = await apiRequest<ApiConversation>("/conversations/", { method: "POST", body: JSON.stringify({ member_id: member.id }) });
      setConversations((current) => [conversation, ...current.filter((item) => item.id !== conversation.id)]);
      setSelectedId(conversation.id);
      router.replace(embedded ? `/community?tab=messages&conversation=${conversation.id}` : `/messages?conversation=${conversation.id}`);
    } catch (reason) { notify(reason instanceof Error ? reason.message : "Could not open this conversation."); }
  }

  if (!authenticated || loading) return <div className="page-loading">Loading {section === "friends" ? "friends…" : embedded ? "chat…" : "messages…"}</div>;
  if (error) return <div className="empty-state"><MessageCircle size={24} /><h3>{error}</h3></div>;

  if (embedded && section === "friends") {
    return <div className="community-friends-grid">
      <section className="side-card friend-requests-card"><div className="section-heading"><div><span className="eyebrow">CONNECTIONS</span><h2>Friend requests</h2></div><Users size={17} /></div>
        {friendData.incoming.length ? friendData.incoming.map((request) => <div className="friend-request-row" key={request.id}><Avatar name={request.sender.name} small photo={request.sender.photo} /><Link href={`/members/${request.sender.id}`}><strong>{request.sender.name}</strong><small>Wants to connect</small></Link><button className="friend-accept" aria-label={`Accept ${request.sender.name}`} onClick={() => void respond(request.id, "accept")}>Accept</button><button className="friend-decline" aria-label={`Decline ${request.sender.name}`} onClick={() => void respond(request.id, "decline")}>×</button></div>) : <p className="member-empty">No pending requests.</p>}
      </section>
      <section className="side-card friends-list-card"><div className="section-heading"><div><span className="eyebrow">YOUR PEOPLE</span><h2>Friends</h2></div><Users size={17} /></div>
        {friendData.friends.length ? friendData.friends.map((member) => <div className="friend-directory-row" key={member.id}><Avatar name={member.name} small photo={member.photo} /><Link href={`/members/${member.id}`}><strong>{member.name}</strong><small>{member.location || member.fitness_level}</small></Link><button className="icon-button" aria-label={`Message ${member.name}`} onClick={() => void startConversation(member)}><MessageCircle size={16} /></button></div>) : <p className="member-empty">Connect with members to see them here.</p>}
      </section>
      <section className="side-card friends-list-card"><div className="section-heading"><div><span className="eyebrow">REQUESTS YOU SENT</span><h2>Outgoing</h2></div></div>
        {friendData.outgoing.length ? friendData.outgoing.map((request) => <div className="friend-directory-row" key={request.id}><Avatar name={request.receiver.name} small photo={request.receiver.photo} /><Link href={`/members/${request.receiver.id}`}><strong>{request.receiver.name}</strong><small>Request pending</small></Link></div>) : <p className="member-empty">No outgoing requests.</p>}
      </section>
    </div>;
  }

  if (embedded) {
    return <div className="community-messages-layout">
      <section className="side-card conversation-list-card community-conversation-list"><div className="section-heading"><div><span className="eyebrow">FIND YOUR PEOPLE</span><h2>Members</h2></div><Users size={17} /></div>
        <div className="community-member-tabs" role="tablist" aria-label="Member lists">
          <button type="button" role="tab" aria-selected={memberTab === "online"} className={memberTab === "online" ? "active" : ""} onClick={() => setMemberTab("online")}>Online <span>{directory.filter((member) => member.is_online).length}</span></button>
          <button type="button" role="tab" aria-selected={memberTab === "friends"} className={memberTab === "friends" ? "active" : ""} onClick={() => setMemberTab("friends")}>Your friends <span>{friendData.friends.length}</span></button>
          <button type="button" role="tab" aria-selected={memberTab === "requests"} className={memberTab === "requests" ? "active" : ""} onClick={() => setMemberTab("requests")}>Requests <span>{friendData.incoming.length}</span></button>
        </div>
        <div className="community-member-chat-list">
          {memberTab === "online" && (directory.filter((member) => member.is_online).length ? directory.filter((member) => member.is_online).map((member) => <CommunityMemberRow key={member.id} member={member} />) : <p className="member-empty">No members are online right now.</p>)}
          {memberTab === "friends" && (friendData.friends.length ? friendData.friends.map((member) => <div className="friend-directory-row" key={member.id}><Avatar name={member.name} small photo={member.photo} /><Link href={`/members/${member.id}`}><strong>{member.name}</strong><small>{member.location || member.fitness_level}</small></Link><button className="icon-button" aria-label={`Message ${member.name}`} onClick={() => void startConversation(member)}><MessageCircle size={16} /></button></div>) : <p className="member-empty">Connect with members to see them here.</p>)}
          {memberTab === "requests" && <>
            {friendData.incoming.length ? friendData.incoming.map((request) => <div className="friend-request-row" key={request.id}><Avatar name={request.sender.name} small photo={request.sender.photo} /><Link href={`/members/${request.sender.id}`}><strong>{request.sender.name}</strong><small>Wants to connect</small></Link><button className="friend-accept" aria-label={`Accept ${request.sender.name}`} onClick={() => void respond(request.id, "accept")}>Accept</button><button className="friend-decline" aria-label={`Decline ${request.sender.name}`} onClick={() => void respond(request.id, "decline")}>×</button></div>) : <p className="member-empty">No incoming friend requests.</p>}
            {friendData.outgoing.map((request) => <div className="friend-directory-row" key={request.id}><Avatar name={request.receiver.name} small photo={request.receiver.photo} /><Link href={`/members/${request.receiver.id}`}><strong>{request.receiver.name}</strong><small>Request pending</small></Link></div>)}
          </>}
        </div>
      </section>
      <section className="side-card message-thread">
        {selectedConversation ? <><header className="message-thread-header"><Avatar name={selectedConversation.member.name} photo={selectedConversation.member.photo} /><span><strong>{selectedConversation.member.name}</strong><small>{selectedConversation.member.location || "PrimeFit member"}</small></span></header>
          <div className="message-thread-body">{messages.length ? messages.map((message) => <article key={message.id} className={`direct-message ${message.sender.id === selectedConversation.member.id ? "incoming-message" : "outgoing-message"}`}><p>{message.body}</p><time>{new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(message.created_at))}</time></article>) : <div className="thread-empty"><MessageCircle size={23} /><p>Say hello and start the conversation.</p></div>}</div>
          <form className="message-compose" onSubmit={(event) => void sendMessage(event)}><input value={body} onChange={(event) => setBody(event.target.value)} maxLength={2000} placeholder={`Message ${selectedConversation.member.name}…`} aria-label="Message" required /><button className="button button-dark" aria-label="Send message"><Send size={15} /></button></form>
        </> : <div className="thread-empty"><UserRound size={25} /><h3>Your next conversation starts with a friend.</h3><p>Accept a friend request or connect with a member to start chatting.</p><Link className="text-action" href="/community?tab=posts">Explore members <ArrowRight size={14} /></Link></div>}
      </section>
    </div>;
  }

  return <><div className="page-intro"><span className="eyebrow">YOUR COMMUNITY</span><h1>Messages <em>and friends.</em></h1><p>Keep in touch with members you’ve connected with.</p></div>
    {error && <div className="empty-state"><MessageCircle size={24} /><h3>{error}</h3></div>}
    {!error && <div className="messages-layout">
      <aside className="messages-sidebar">
        <section className="side-card friend-requests-card"><div className="section-heading"><div><span className="eyebrow">CONNECTIONS</span><h2>Friend requests</h2></div><Users size={17} /></div>
          {friendData.incoming.length ? friendData.incoming.map((request) => <div className="friend-request-row" key={request.id}><Avatar name={request.sender.name} small photo={request.sender.photo} /><Link href={`/members/${request.sender.id}`}><strong>{request.sender.name}</strong><small>Wants to connect</small></Link><button className="friend-accept" aria-label={`Accept ${request.sender.name}`} onClick={() => void respond(request.id, "accept")}>Accept</button><button className="friend-decline" aria-label={`Decline ${request.sender.name}`} onClick={() => void respond(request.id, "decline")}>×</button></div>) : <p className="member-empty">No pending requests.</p>}
        </section>
        <section className="side-card conversation-list-card"><div className="section-heading"><div><span className="eyebrow">PRIVATE CHAT</span><h2>Conversations</h2></div><MessageCircle size={17} /></div>
          {conversations.length ? conversations.map((item) => <button className={`conversation-list-item ${selectedId === item.id ? "active" : ""}`} key={item.id} onClick={() => { setSelectedId(item.id); router.replace(`/messages?conversation=${item.id}`); }}><Avatar name={item.member.name} small photo={item.member.photo} /><span><strong>{item.member.name}</strong><small>{item.last_message?.body ?? "Start a conversation"}</small></span></button>) : <p className="member-empty">Add a friend from their profile to start chatting.</p>}
        </section>
        <section className="side-card friends-list-card"><div className="section-heading"><div><span className="eyebrow">YOUR PEOPLE</span><h2>Friends</h2></div></div>
          {friendData.friends.length ? friendData.friends.map((member) => <div className="friend-directory-row" key={member.id}><Avatar name={member.name} small photo={member.photo} /><Link href={`/members/${member.id}`}><strong>{member.name}</strong><small>{member.location || member.fitness_level}</small></Link><button className="icon-button" aria-label={`Message ${member.name}`} onClick={() => void startConversation(member)}><MessageCircle size={16} /></button></div>) : <p className="member-empty">Friend members to see them here.</p>}
        </section>
      </aside>
      <section className="side-card message-thread">
        {selectedConversation ? <><header className="message-thread-header"><Avatar name={selectedConversation.member.name} photo={selectedConversation.member.photo} /><span><strong>{selectedConversation.member.name}</strong><small>{selectedConversation.member.location || "PrimeFit member"}</small></span></header>
          <div className="message-thread-body">{messages.length ? messages.map((message) => <article key={message.id} className={`direct-message ${message.sender.id === selectedConversation.member.id ? "incoming-message" : "outgoing-message"}`}><p>{message.body}</p><time>{new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(message.created_at))}</time></article>) : <div className="thread-empty"><MessageCircle size={23} /><p>Say hello and start the conversation.</p></div>}</div>
          <form className="message-compose" onSubmit={(event) => void sendMessage(event)}><input value={body} onChange={(event) => setBody(event.target.value)} maxLength={2000} placeholder={`Message ${selectedConversation.member.name}…`} aria-label="Message" required /><button className="button button-dark" aria-label="Send message"><Send size={15} /></button></form>
        </> : <div className="thread-empty"><UserRound size={25} /><h3>Your next conversation starts with a friend.</h3><p>Visit a member’s profile to send a friend request.</p><Link className="text-action" href="/community">Explore community <ArrowRight size={14} /></Link></div>}
      </section>
    </div>}
  </>;
}
