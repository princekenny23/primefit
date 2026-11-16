"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRight, MapPin } from "lucide-react";
import { apiRequest, ApiCommunityMember } from "@/lib/api";
import { Avatar } from "@/components/product-ui";
import { usePrimeFit } from "@/providers/app-provider";

export function FollowButton({ memberId, initialFollowing }: { memberId: number; initialFollowing: boolean }) {
  const { authenticated, notify } = usePrimeFit();
  const router = useRouter();
  const [following, setFollowing] = useState(initialFollowing);
  const [busy, setBusy] = useState(false);
  useEffect(() => setFollowing(initialFollowing), [initialFollowing, memberId]);

  async function toggleFollow() {
    if (!authenticated) {
      router.push(`/login?next=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    setBusy(true);
    try {
      const result = await apiRequest<{ following: boolean }>(`/members/${memberId}/follow/`, {
        method: following ? "DELETE" : "POST",
      });
      setFollowing(result.following);
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : "Could not update this follow.");
    } finally {
      setBusy(false);
    }
  }

  return <button className={`member-follow-button ${following ? "following" : ""}`} type="button" aria-pressed={following} disabled={busy} onClick={(event) => { event.preventDefault(); event.stopPropagation(); void toggleFollow(); }}>{busy ? "…" : following ? "Following" : "Follow"}</button>;
}

export function CommunityMemberRow({ member }: { member: ApiCommunityMember }) {
  return <article className="community-member-row">
    <Link className="community-member-link" href={`/members/${member.id}`}>
      <span className="community-member-avatar"><Avatar name={member.name} small photo={member.photo} />{member.is_online && <i aria-label="Online" />}</span>
      <span className="community-member-info"><strong>{member.name}</strong><small>{member.location || member.fitness_level}</small></span>
    </Link>
    <FollowButton memberId={member.id} initialFollowing={member.is_following} />
  </article>;
}

export function TrainerDirectoryCard({ member }: { member: ApiCommunityMember }) {
  return <article className="trainer-directory-card">
    <Link href={`/members/${member.id}`} className="trainer-directory-link" aria-label={`View ${member.name}'s profile`}>
      {member.photo ? <Image src={member.photo} alt="" fill sizes="(max-width: 650px) 100vw, (max-width: 1000px) 50vw, 33vw" unoptimized /> : <div className="trainer-directory-placeholder"><Avatar name={member.name} /></div>}
      <span className="trainer-directory-shade" />
      <span className="trainer-directory-copy"><strong>{member.name}</strong><small>{member.expertise || "PrimeFit trainer"}</small><span><MapPin size={13} />{member.location || `${member.experience_years} years coaching`}</span></span>
      <span className="trainer-directory-arrow"><ArrowRight size={17} /></span>
    </Link>
    <FollowButton memberId={member.id} initialFollowing={member.is_following} />
  </article>;
}
