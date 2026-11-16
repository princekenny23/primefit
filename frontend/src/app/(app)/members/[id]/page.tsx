"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, MapPin, MessageCircle, UserPlus, UserRoundCheck, Users, X } from "lucide-react";
import { Avatar, Modal } from "@/components/product-ui";
import { FollowButton } from "@/components/community-members";
import { ProfilePostGrid } from "@/components/profile-post-grid";
import { apiList, apiRequest, ApiChallenge, ApiPost } from "@/lib/api";
import { FeedPost, mapPost } from "@/lib/primefit-types";
import { usePrimeFit } from "@/providers/app-provider";

type PublicMember = { member: { id: number; name: string; location: string; photo: string | null; cover_photo: string | null; is_following: boolean }; points: number; completed_challenges: ApiChallenge[] };
type FriendState = { status: "loading" | "none" | "friends" | "friend_sent" | "incoming" | "self"; request_id: number | null };
type ProfileTab = "posts" | "challenge-updates" | "about";
type PreviewImage = { src: string; alt: string };

export default function MemberProfilePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { authenticated, notify, addComment } = usePrimeFit();
  const [data, setData] = useState<PublicMember | null>(null);
  const [error, setError] = useState("");
  const [friendState, setFriendState] = useState<FriendState>({ status: "loading", request_id: null });
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const [feedError, setFeedError] = useState("");
  const [activeTab, setActiveTab] = useState<ProfileTab>("posts");
  const [previewImage, setPreviewImage] = useState<PreviewImage | null>(null);
  useEffect(() => { apiRequest<PublicMember>(`/members/${params.id}/`).then(setData).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load this member.")); }, [params.id]);
  useEffect(() => {
    let cancelled = false;
    setPosts([]);
    setPostsLoading(true);
    setFeedError("");
    apiList<ApiPost>(`/posts/?author=${params.id}`)
      .then((items) => { if (!cancelled) setPosts(items.map(mapPost)); })
      .catch((reason: unknown) => {
        if (cancelled) return;
        const message = reason instanceof Error ? reason.message : "Could not load this member's posts.";
        setFeedError(message);
        notify(message);
      })
      .finally(() => { if (!cancelled) setPostsLoading(false); });
    return () => { cancelled = true; };
  }, [notify, params.id]);
  useEffect(() => {
    if (!authenticated) return;
    let cancelled = false;
    apiRequest<FriendState>(`/friends/status/?member_id=${params.id}`)
      .then((result) => { if (!cancelled) setFriendState(result); })
      .catch((reason: unknown) => { if (!cancelled) notify(reason instanceof Error ? reason.message : "Could not load friendship status."); });
    return () => { cancelled = true; };
  }, [authenticated, notify, params.id]);

  async function sendFriendRequest() {
    if (!authenticated) { router.push(`/login?next=/members/${params.id}`); return; }
    try {
      await apiRequest("/friends/", { method: "POST", body: JSON.stringify({ member_id: Number(params.id) }) });
      setFriendState({ status: "friend_sent", request_id: null });
      notify("Friend request sent.");
    } catch (reason) { notify(reason instanceof Error ? reason.message : "Could not send friend request."); }
  }

  async function respondToFriendRequest(decision: "accept" | "decline") {
    if (!friendState.request_id) return;
    try {
      await apiRequest(`/friends/requests/${friendState.request_id}/respond/`, { method: "POST", body: JSON.stringify({ decision }) });
      setFriendState({ status: decision === "accept" ? "friends" : "none", request_id: null });
      notify(decision === "accept" ? "Friend request accepted." : "Friend request declined.");
    } catch (reason) { notify(reason instanceof Error ? reason.message : "Could not update friend request."); }
  }

  async function openConversation() {
    if (!authenticated) { router.push(`/login?next=/members/${params.id}`); return; }
    try {
      const conversation = await apiRequest<{ id: number }>("/conversations/", { method: "POST", body: JSON.stringify({ member_id: Number(params.id) }) });
      router.push(`/community?tab=messages&conversation=${conversation.id}`);
    } catch (reason) { notify(reason instanceof Error ? reason.message : "Could not open this conversation."); }
  }
  async function toggleReaction(post: FeedPost) {
    try {
      const result = await apiRequest<{ reacted: boolean; count: number }>(`/posts/${post.id}/react/`, { method: "POST", body: "{}" });
      setPosts((current) => current.map((item) => item.id === post.id
        ? { ...item, reacted_by_me: result.reacted, reaction_count: result.count }
        : item));
    } catch (reason) { notify(reason instanceof Error ? reason.message : "Could not update your reaction."); }
  }
  async function comment(post: FeedPost, body: string) {
    if (!await addComment(post, body)) return false;
    try {
      const items = await apiList<ApiPost>(`/posts/?author=${params.id}`);
      setPosts(items.map(mapPost));
    } catch (reason) {
      notify(reason instanceof Error ? `Comment added, but posts could not refresh: ${reason.message}` : "Comment added, but posts could not refresh.");
    }
    return true;
  }
  if (error) return <div className="empty-state"><Users size={25} /><h2>{error}</h2><Link className="text-action" href="/community">Back to the community <ArrowRight size={14} /></Link></div>;
  if (!data) return <div className="page-loading"><span />Loading member profile…</div>;
  const { member } = data;
  const visiblePosts = posts.filter((post) => activeTab === "challenge-updates" ? post.challenge != null : post.challenge == null);
  return <>
    <Link className="back-link" href="/community"><ArrowLeft size={15} />Back to the community</Link>
    <div className="page-intro member-page-intro">
      <span className="eyebrow">PRIMEFIT MEMBER</span>
      <h1>Meet <em>{member.name.split(" ")[0]}.</em></h1>
      <p>Every journey is different. This is {member.name.split(" ")[0]}’s.</p>
    </div>
    <section className="member-profile-card">
      <div className="member-profile-cover" style={member.cover_photo ? { backgroundImage: `linear-gradient(180deg, #17312926, #17312945), url("${member.cover_photo}")` } : undefined}>
        <button type="button" className="profile-cover-preview" aria-label="View cover photo" disabled={!member.cover_photo} onClick={() => member.cover_photo && setPreviewImage({ src: member.cover_photo, alt: `${member.name}'s cover photo` })} />
      </div>
      <div className="member-profile-header">
        <button type="button" className="member-profile-avatar member-profile-photo-preview" aria-label="View profile photo" disabled={!member.photo} onClick={() => member.photo && setPreviewImage({ src: member.photo, alt: `${member.name}'s profile photo` })}><Avatar name={member.name} photo={member.photo} /></button>
        <div className="member-profile-name"><h2>{member.name}</h2><span><MapPin size={14} />{member.location || "PrimeFit member"}</span></div>
      </div>
      <div className="member-social-actions">
        {friendState.status !== "self" && <FollowButton memberId={member.id} initialFollowing={member.is_following} />}
        {friendState.status === "incoming" ? <>
          <button className="button button-lime" onClick={() => void respondToFriendRequest("accept")}><UserRoundCheck size={15} />Accept request</button>
          <button className="button button-outline" onClick={() => void respondToFriendRequest("decline")}><X size={15} />Decline</button>
        </> : friendState.status === "friends" ? <>
          <span className="pill pill-lime"><UserRoundCheck size={14} />Friends</span>
          <button className="button button-dark" onClick={() => void openConversation()}><MessageCircle size={15} />Message</button>
        </> : friendState.status === "friend_sent" ? <span className="pill pill-soft">Request sent</span> : friendState.status !== "self" && (
          friendState.status === "loading" && authenticated
            ? <button className="button button-outline" disabled>Checking connection…</button>
            : <button className="button button-dark" onClick={() => void sendFriendRequest()}><UserPlus size={15} />Add friend</button>
        )}
      </div>
    </section>
    <nav className="profile-feed-tabs" aria-label={`${member.name}'s activity`}>
      <button type="button" className={activeTab === "posts" ? "active" : ""} aria-pressed={activeTab === "posts"} onClick={() => setActiveTab("posts")}>Posts<span>{posts.filter((post) => post.challenge == null).length}</span></button>
      <button type="button" className={activeTab === "challenge-updates" ? "active" : ""} aria-pressed={activeTab === "challenge-updates"} onClick={() => setActiveTab("challenge-updates")}>Challenge updates<span>{posts.filter((post) => post.challenge != null).length}</span></button>
      <button type="button" className={activeTab === "about" ? "active" : ""} aria-pressed={activeTab === "about"} onClick={() => setActiveTab("about")}>About</button>
    </nav>
    {activeTab === "about" ? <section className="side-card profile-about-summary">
      <div className="section-heading"><div><span className="eyebrow">MEMBER PROGRESS</span><h2>Challenges and points</h2></div></div>
      <div className="profile-about-stats"><article><span>Points earned</span><strong>{data.points.toLocaleString()}</strong></article><article><span>Challenges completed</span><strong>{data.completed_challenges.length}</strong></article></div>
    </section> : <ProfilePostGrid
      posts={visiblePosts}
      loading={postsLoading}
      error={feedError}
      emptyTitle={activeTab === "challenge-updates" ? "No challenge updates yet" : "No posts yet"}
      emptyMessage={activeTab === "challenge-updates" ? `${member.name}'s challenge updates will appear here.` : `${member.name}'s community posts will appear here.`}
      onLike={toggleReaction}
      onComment={comment}
    />}
    {previewImage && <Modal title={previewImage.alt} eyebrow="MEMBER PHOTO" onClose={() => setPreviewImage(null)} className="profile-image-modal"><div className="profile-image-viewer"><Image src={previewImage.src} alt={previewImage.alt} fill sizes="(max-width: 700px) 90vw, 700px" unoptimized /></div></Modal>}
  </>;
}
