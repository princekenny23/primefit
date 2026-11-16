"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, FileText, MessageCircle, Trophy, Users } from "lucide-react";
import { Avatar, Leaderboard, PostCard, PostComposer, SectionHeading } from "@/components/product-ui";
import { CommunityMemberRow, TrainerDirectoryCard } from "@/components/community-members";
import { MessagesInbox } from "@/components/community-messaging";
import { apiList, ApiCurrentChallenge, ApiCommunityMember } from "@/lib/api";
import { FeedPost } from "@/lib/primefit-types";
import { usePrimeFit } from "@/providers/app-provider";

export default function CommunityPage() {
  return <Suspense fallback={<div className="page-loading">Loading community…</div>}><CommunityContent /></Suspense>;
}

function CommunityContent() {
  const { posts, toggleReaction, publishPost, addComment, authenticated, refreshPosts, notify } = usePrimeFit();
  const [openComments, setOpenComments] = useState<number | null>(null);
  const [commentText, setCommentText] = useState("");
  const [directory, setDirectory] = useState<ApiCommunityMember[]>([]);
  const [currentChallenges, setCurrentChallenges] = useState<ApiCurrentChallenge[]>([]);
  const [challengesLoading, setChallengesLoading] = useState(false);
  const [challengeLoadError, setChallengeLoadError] = useState("");
  const [selectedChallengeId, setSelectedChallengeId] = useState<number | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const activeTab = tabParam === "challenge-updates" || tabParam === "messages" ? tabParam : tabParam === "trainers" || tabParam === "friends" ? "trainers" : "posts";
  const currentChallengeIds = new Set(currentChallenges.map((challenge) => challenge.id));
  const visiblePosts = activeTab === "challenge-updates"
    ? posts.filter((post) => post.challenge != null && currentChallengeIds.has(post.challenge)
      && (selectedChallengeId === null || post.challenge === selectedChallengeId))
    : posts.filter((post) => post.challenge == null);

  useEffect(() => {
    apiList<ApiCommunityMember>("/members/")
      .then(setDirectory)
      .catch((error: unknown) => notify(error instanceof Error ? error.message : "Could not load community members."));
  }, [notify]);

  useEffect(() => {
    if (activeTab !== "challenge-updates") return;
    let cancelled = false;
    setChallengesLoading(true);
    setChallengeLoadError("");
    setCurrentChallenges([]);
    setSelectedChallengeId(null);
    apiList<ApiCurrentChallenge>("/challenges/current/")
      .then((items) => {
        if (cancelled) return;
        setCurrentChallenges(items);
        setSelectedChallengeId((current) => current !== null && items.some((item) => item.id === current) ? current : null);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "Could not load current challenges.";
        setChallengeLoadError(message);
        notify(message);
      })
      .finally(() => {
        if (!cancelled) setChallengesLoading(false);
      });
    refreshPosts().catch((error: unknown) => {
      if (!cancelled) notify(error instanceof Error ? error.message : "Could not refresh challenge updates.");
    });
    return () => { cancelled = true; };
  }, [activeTab, notify, refreshPosts]);

  function selectTab(tab: "posts" | "challenge-updates" | "messages" | "trainers") {
    const query = new URLSearchParams();
    if (tab !== "posts") query.set("tab", tab);
    if (tab === "messages" && searchParams.get("conversation")) query.set("conversation", searchParams.get("conversation")!);
    const queryString = query.toString();
    router.replace(queryString ? `/community?${queryString}` : "/community", { scroll: false });
  }

  async function comment(event: FormEvent<HTMLFormElement>, post: FeedPost) {
    event.preventDefault();
    if (!authenticated) { router.push("/login?next=/community"); return; }
    if (await addComment(post, commentText)) setCommentText("");
  }

  return <>
    <div className="page-intro community-page-intro"><span className="eyebrow">ONE PRIMEFIT COMMUNITY</span><h1>We move <em>together.</em></h1><p>Every effort matters. Every bit of encouragement counts.</p></div>
    <nav className="community-tabs" aria-label="Community sections">
      <button type="button" className={activeTab === "posts" ? "active" : ""} aria-current={activeTab === "posts" ? "page" : undefined} onClick={() => selectTab("posts")}><FileText size={17} />Posts</button>
      <button type="button" className={activeTab === "challenge-updates" ? "active" : ""} aria-current={activeTab === "challenge-updates" ? "page" : undefined} onClick={() => selectTab("challenge-updates")}><Trophy size={17} />Challenge updates</button>
      <button type="button" className={activeTab === "messages" ? "active" : ""} aria-current={activeTab === "messages" ? "page" : undefined} onClick={() => selectTab("messages")}><MessageCircle size={17} />Chat</button>
      <button type="button" className={activeTab === "trainers" ? "active" : ""} aria-current={activeTab === "trainers" ? "page" : undefined} onClick={() => selectTab("trainers")}><Users size={17} />Trainers</button>
    </nav>
    {activeTab === "posts" && <div className="community-posts-layout">
      <aside className="side-card community-member-sidebar">
        <div className="section-heading"><div><span className="eyebrow">YOUR COMMUNITY</span><h2>Members</h2></div><Users size={17} /></div>
        <div className="community-member-list">{directory.map((member) => <CommunityMemberRow key={member.id} member={member} />)}</div>
        {!directory.length && <p className="member-empty">Member profiles will show up here.</p>}
      </aside>
      <section className="feed-column community-feed">
        <PostComposer onPublish={publishPost} />
        <div className="feed-sort"><SectionHeading eyebrow="YOUR COMMUNITY, RIGHT NOW" title="The good stuff" /><span className="feed-sort-label"><span />Latest updates</span></div>
        {visiblePosts.map((post) => <div className="feed-item" key={post.id}><PostCard post={post} onLike={() => void toggleReaction(post)} onComment={() => setOpenComments(openComments === post.id ? null : post.id)} />{openComments === post.id && <div className="comments-panel">{post.comments.length ? post.comments.map((commentItem) => <div className="sample-comment" key={commentItem.id}><Avatar name={commentItem.author.name} small /><p><strong>{commentItem.author.name}</strong>{commentItem.body}</p></div>) : <p className="no-comments">Be the first to encourage this member.</p>}<form onSubmit={(event) => void comment(event, post)}><input value={commentText} onChange={(event) => setCommentText(event.target.value)} placeholder="Write an encouraging comment..." maxLength={500} /><button aria-label="Send comment"><ArrowRight size={16} /></button></form></div>}</div>)}
        {!visiblePosts.length && <div className="empty-state"><Users size={24} /><h3>No community updates yet</h3><p>Share the first update with your community.</p></div>}
      </section>
    </div>}
    {activeTab === "challenge-updates" && <div className="community-challenge-column"><Leaderboard /><section className="feed-column community-feed">
      <div className="challenge-update-filter" role="group" aria-label="Filter updates by current challenge">
        <button type="button" className={selectedChallengeId === null ? "active" : ""} aria-pressed={selectedChallengeId === null} onClick={() => setSelectedChallengeId(null)}>All current challenges</button>
        {currentChallenges.map((challenge) => <button type="button" key={challenge.id} className={selectedChallengeId === challenge.id ? "active" : ""} aria-pressed={selectedChallengeId === challenge.id} onClick={() => setSelectedChallengeId(challenge.id)}>{challenge.title}</button>)}
        {challengesLoading && <span className="challenge-filter-status">Loading…</span>}
        {!challengesLoading && challengeLoadError && <span className="challenge-filter-status">Challenge list unavailable</span>}
        {!challengesLoading && !challengeLoadError && !currentChallenges.length && <span className="challenge-filter-status">No active challenges</span>}
      </div>
      <div className="feed-sort"><SectionHeading eyebrow="MEMBERS IN ACTION" title="Recent completions" /><span className="feed-sort-label"><span />Latest updates</span></div>
      {visiblePosts.map((post) => <div className="feed-item" key={post.id}><PostCard post={post} onLike={() => void toggleReaction(post)} onComment={() => setOpenComments(openComments === post.id ? null : post.id)} />{openComments === post.id && <div className="comments-panel">{post.comments.length ? post.comments.map((commentItem) => <div className="sample-comment" key={commentItem.id}><Avatar name={commentItem.author.name} small /><p><strong>{commentItem.author.name}</strong>{commentItem.body}</p></div>) : <p className="no-comments">Be the first to encourage this member.</p>}<form onSubmit={(event) => void comment(event, post)}><input value={commentText} onChange={(event) => setCommentText(event.target.value)} placeholder="Write an encouraging comment..." maxLength={500} /><button aria-label="Send comment"><ArrowRight size={16} /></button></form></div>}</div>)}
      {!visiblePosts.length && <div className="empty-state"><Users size={24} /><h3>{challengesLoading ? "Loading challenge updates…" : challengeLoadError ? "Challenge updates are unavailable" : !currentChallenges.length ? "No active challenges" : selectedChallengeId === null ? "No challenge updates yet" : "No updates for this challenge yet"}</h3><p>{challengeLoadError || (!challengesLoading && !currentChallenges.length ? "Current challenges and their updates will appear here." : "Updates from members participating in current challenges will appear here.")}</p></div>}
    </section></div>}
    {activeTab === "trainers" && <section className="trainer-directory-section"><SectionHeading eyebrow="COACHES WHO GET YOU" title="Meet our trainers" /><div className="trainer-directory-grid">{directory.filter((member) => member.role === "trainer").map((member) => <TrainerDirectoryCard key={member.id} member={member} />)}</div>{!directory.some((member) => member.role === "trainer") && <div className="empty-state"><Users size={24} /><h3>No trainers to show yet</h3><p>Approved PrimeFit trainers will appear here.</p></div>}</section>}
    {activeTab === "messages" && <MessagesInbox embedded section="messages" />}
  </>;
}
