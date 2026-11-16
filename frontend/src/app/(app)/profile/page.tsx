"use client";

import { FormEvent, useEffect, useState } from "react";
import Image from "next/image";
import { ArrowRight, Camera, Info, MapPin } from "lucide-react";
import { Avatar, Modal } from "@/components/product-ui";
import { ProfilePostGrid } from "@/components/profile-post-grid";
import { apiList, apiRequest, ApiPost } from "@/lib/api";
import { FeedPost, mapPost, Profile } from "@/lib/primefit-types";
import { usePrimeFit } from "@/providers/app-provider";

type ProfileTab = "posts" | "challenge-updates" | "about";
type PreviewImage = { src: string; alt: string };

export default function ProfilePage() {
  const { profile, points, completedChallengeCount, authenticated, saveProfile, uploadProfilePhoto, uploadProfileCoverPhoto, signOut, addComment, notify } = usePrimeFit();
  const [aboutOpen, setAboutOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ProfileTab>("posts");
  const [previewImage, setPreviewImage] = useState<PreviewImage | null>(null);
  const [memberId, setMemberId] = useState<number | null>(null);
  const [ownPosts, setOwnPosts] = useState<FeedPost[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [postsError, setPostsError] = useState("");

  useEffect(() => {
    if (!authenticated) return;
    let cancelled = false;
    setPostsLoading(true);
    setPostsError("");
    apiRequest<{ id: number }>("/me/")
      .then(async ({ id }) => {
        if (cancelled) return;
        setMemberId(id);
        const posts = await apiList<ApiPost>(`/posts/?author=${id}`);
        if (!cancelled) setOwnPosts(posts.map(mapPost));
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : "Could not load your profile posts.";
          setPostsError(message);
          notify(message);
        }
      })
      .finally(() => { if (!cancelled) setPostsLoading(false); });
    return () => { cancelled = true; };
  }, [authenticated, notify]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const updated: Partial<Profile> = {
      display_name: String(data.get("display_name")),
      bio: String(data.get("bio")),
      fitness_goal: String(data.get("fitness_goal")),
      workout_preference: String(data.get("workout_preference")),
      area: String(data.get("area")),
      city: String(data.get("city")),
      country: String(data.get("country")),
    };
    if (await saveProfile(updated)) setAboutOpen(false);
  }

  async function changePhoto(event: FormEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const photo = input.files?.[0];
    if (!photo) return;
    try { await uploadProfilePhoto(photo); }
    finally { input.value = ""; }
  }

  async function changeCoverPhoto(event: FormEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const photo = input.files?.[0];
    if (!photo) return;
    try { await uploadProfileCoverPhoto(photo); }
    finally { input.value = ""; }
  }

  async function toggleReaction(post: FeedPost) {
    try {
      const result = await apiRequest<{ reacted: boolean; count: number }>(`/posts/${post.id}/react/`, { method: "POST", body: "{}" });
      setOwnPosts((current) => current.map((item) => item.id === post.id
        ? { ...item, reacted_by_me: result.reacted, reaction_count: result.count }
        : item));
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not update your reaction.");
    }
  }

  async function comment(post: FeedPost, body: string) {
    if (!await addComment(post, body)) return false;
    if (!memberId) return true;
    try {
      const posts = await apiList<ApiPost>(`/posts/?author=${memberId}`);
      setOwnPosts(posts.map(mapPost));
    } catch (error) {
      notify(error instanceof Error ? `Comment added, but posts could not refresh: ${error.message}` : "Comment added, but posts could not refresh.");
    }
    return true;
  }

  const fullName = profile.display_name || "PrimeFit member";
  const visiblePosts = ownPosts.filter((post) => activeTab === "challenge-updates" ? post.challenge != null : post.challenge == null);
  return <>
    <div className="page-intro"><span className="eyebrow">YOUR PRIMEFIT PROFILE</span><h1>Your journey, <em>in motion.</em></h1><p>A little progress adds up to a lot of strength.</p></div>
    <div className="profile-page">
      <section className="profile-main-card profile-owner-card">
        <div className={`profile-cover ${profile.cover_photo ? "has-cover-photo" : ""}`} style={profile.cover_photo ? { backgroundImage: `linear-gradient(180deg, #17312926, #17312945), url("${profile.cover_photo}")` } : undefined}>
          <button type="button" className="profile-cover-preview" aria-label="View cover photo" disabled={!profile.cover_photo} onClick={() => profile.cover_photo && setPreviewImage({ src: profile.cover_photo, alt: "Profile cover photo" })} />
          <span className="profile-cover-label">PRIMEFIT MEMBER</span>
          <div className="profile-cover-actions">
            <label className="cover-photo-upload" title="Update cover photo"><Camera size={15} /><span>Cover</span><input type="file" accept="image/*" aria-label="Upload a cover photo" onChange={changeCoverPhoto} /></label>
            <button type="button" className="about-info-button" aria-label="Edit About you information" title="About you" onClick={() => setAboutOpen(true)}><Info size={18} /></button>
          </div>
          {!profile.cover_photo && <div className="cover-orbit" />}
        </div>
        <div className="profile-main-info">
          <div className="profile-avatar profile-photo-picker">
            <button type="button" className="profile-photo-preview" aria-label="View profile photo" disabled={!profile.photo} onClick={() => profile.photo && setPreviewImage({ src: profile.photo, alt: `${fullName}'s profile photo` })}><Avatar name={fullName} photo={profile.photo} /></button>
            <label className="photo-upload" title="Update profile photo"><Camera size={13} /><input type="file" accept="image/*" aria-label="Upload a profile photo" onChange={changePhoto} /></label>
          </div>
          <div className="profile-title"><h2>{fullName}</h2><span><MapPin size={14} />{[profile.city, profile.country].filter(Boolean).join(", ") || "Add your location"}</span></div>
        </div>
      </section>

      <nav className="profile-feed-tabs" aria-label="Profile activity">
        <button type="button" className={activeTab === "posts" ? "active" : ""} aria-pressed={activeTab === "posts"} onClick={() => setActiveTab("posts")}>Posts<span>{ownPosts.filter((post) => post.challenge == null).length}</span></button>
        <button type="button" className={activeTab === "challenge-updates" ? "active" : ""} aria-pressed={activeTab === "challenge-updates"} onClick={() => setActiveTab("challenge-updates")}>Challenge updates<span>{ownPosts.filter((post) => post.challenge != null).reduce((count, post) => count + post.comments.length, 0)}</span></button>
        <button type="button" className={activeTab === "about" ? "active" : ""} aria-pressed={activeTab === "about"} onClick={() => setActiveTab("about")}>About</button>
      </nav>

      {activeTab !== "about" && <ProfilePostGrid
        posts={visiblePosts}
        loading={postsLoading}
        error={postsError}
        emptyTitle={activeTab === "challenge-updates" ? "No comments yet" : "No posts yet"}
        emptyMessage={activeTab === "challenge-updates" ? "Comments on your challenge updates will appear here." : "Your community posts will appear here."}
        onLike={toggleReaction}
        onComment={comment}
        commentsOnly={activeTab === "challenge-updates"}
      />}
      {activeTab === "about" && <section className="side-card profile-about-summary">
        <div className="section-heading"><div><span className="eyebrow">YOUR PROGRESS</span><h2>Challenges and points</h2></div></div>
        <div className="profile-about-stats"><article><span>Points earned</span><strong>{points.toLocaleString()}</strong></article><article><span>Challenges completed</span><strong>{completedChallengeCount}</strong></article></div>
        {profile.bio && <p className="profile-about-bio">{profile.bio}</p>}
        <p className="profile-about-goal">Current goal: <strong>{profile.fitness_goal.replaceAll("_", " ")}</strong></p>
      </section>}
      {authenticated && <button className="signout-button profile-signout" onClick={signOut}>Sign out</button>}
    </div>
    {previewImage && <Modal title={previewImage.alt} eyebrow="PROFILE PHOTO" onClose={() => setPreviewImage(null)} className="profile-image-modal"><div className="profile-image-viewer"><Image src={previewImage.src} alt={previewImage.alt} fill sizes="(max-width: 700px) 90vw, 700px" unoptimized /></div></Modal>}
    {aboutOpen && <Modal title="About you" eyebrow="PROFILE DETAILS" onClose={() => setAboutOpen(false)} className="profile-about-modal">
      <p className="modal-intro">Share a little about your goals and where you move.</p>
      <form className="profile-edit profile-about-form" onSubmit={(event) => void save(event)} key={JSON.stringify(profile)}>
        <div className="profile-form-grid">
          <label>Display name<input name="display_name" maxLength={80} defaultValue={profile.display_name} required /></label>
          <label>Fitness goal<select name="fitness_goal" defaultValue={profile.fitness_goal}><option value="strength">Build strength</option><option value="fitness">Improve fitness</option><option value="weight">Weight management</option><option value="mobility">Mobility</option><option value="cardio">Cardio & fat burning</option></select></label>
          <label>Workout preference<select name="workout_preference" defaultValue={profile.workout_preference}><option value="gym">Gym</option><option value="home">At home</option><option value="both">Both</option></select></label>
          <label>Area<input name="area" maxLength={80} defaultValue={profile.area} placeholder="e.g. Area 10" /></label>
          <label>City<input name="city" maxLength={80} defaultValue={profile.city} placeholder="e.g. Lilongwe" /></label>
          <label>Country<input name="country" maxLength={80} defaultValue={profile.country} placeholder="e.g. Malawi" /></label>
          <label className="profile-bio-field">About you<textarea name="bio" maxLength={240} rows={3} defaultValue={profile.bio ?? ""} placeholder="A little about your fitness journey..." /></label>
        </div>
        <p className="profile-note">Location is used for local leaderboards. PrimeFit does not use GPS.</p>
        <button className="button button-dark profile-save-button" type="submit">Save details <ArrowRight size={14} /></button>
      </form>
    </Modal>}
  </>;
}
