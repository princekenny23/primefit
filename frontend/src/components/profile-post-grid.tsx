"use client";

import { FormEvent, useRef, useState } from "react";
import Image from "next/image";
import { Heart, MessageCircle, Send, Users } from "lucide-react";
import { Avatar, Modal, PostCard } from "@/components/product-ui";
import { FeedPost } from "@/lib/primefit-types";

export function ProfilePostGrid({
  posts,
  loading,
  error,
  emptyTitle,
  emptyMessage,
  onLike,
  onComment,
  commentsOnly = false,
}: {
  posts: FeedPost[];
  loading: boolean;
  error?: string;
  emptyTitle: string;
  emptyMessage: string;
  onLike: (post: FeedPost) => void;
  onComment: (post: FeedPost, body: string) => Promise<boolean>;
  commentsOnly?: boolean;
}) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [commentText, setCommentText] = useState("");
  const commentInput = useRef<HTMLInputElement>(null);
  const selectedPost = posts.find((post) => post.id === selectedId) ?? null;
  const comments = posts.flatMap((post) => post.comments.map((comment) => ({ comment, post })));

  async function submitComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedPost || !await onComment(selectedPost, commentText)) return;
    setCommentText("");
  }

  return <>
    {commentsOnly && comments.length > 0 && <div className="profile-comment-list">
      {comments.map(({ comment, post }) => <article className="profile-comment-entry" key={`${post.id}-${comment.id}`}>
        <Avatar name={comment.author.name} small />
        <div className="profile-comment-entry-copy">
          <p><strong>{comment.author.name}</strong> {comment.body}</p>
          <small>On your challenge update: {post.body}</small>
          <button type="button" className="text-action" onClick={() => setSelectedId(post.id)}>Open discussion</button>
        </div>
      </article>)}
    </div>}
    {!commentsOnly && posts.length > 0 && <div className="profile-post-grid">
      {posts.map((post) => <button type="button" className={`profile-post-tile ${post.image ? "has-image" : "text-post-tile"}`} key={post.id} onClick={() => setSelectedId(post.id)} aria-label={`View post by ${post.author.name}`}>
        {post.image ? <Image src={post.image} alt="" fill sizes="(max-width: 650px) 33vw, (max-width: 1000px) 25vw, 220px" unoptimized /> : <span className="profile-post-tile-text">{post.body}</span>}
        <span className="profile-post-tile-overlay"><span><Heart size={17} fill="currentColor" />{post.reaction_count}</span><span><MessageCircle size={17} fill="currentColor" />{post.comments.length}</span></span>
      </button>)}
    </div>}
    {loading && <div className="page-loading">Loading posts…</div>}
    {!loading && error && <div className="empty-state"><Users size={24} /><h3>{error}</h3></div>}
    {!loading && !error && !(commentsOnly ? comments.length : posts.length) && <div className="empty-state"><Users size={24} /><h3>{emptyTitle}</h3><p>{emptyMessage}</p></div>}
    {selectedPost && <Modal title={`Post by ${selectedPost.author.name}`} eyebrow={selectedPost.time} onClose={() => setSelectedId(null)} className="profile-post-modal">
      <PostCard post={selectedPost} onLike={() => onLike(selectedPost)} onComment={() => commentInput.current?.focus()} />
      <div className="profile-post-modal-comments">
        {selectedPost.comments.length ? selectedPost.comments.map((item) => <div className="sample-comment" key={item.id}><Avatar name={item.author.name} small /><p><strong>{item.author.name}</strong>{item.body}</p></div>) : <p className="no-comments">Be the first to encourage this member.</p>}
        <form onSubmit={(event) => void submitComment(event)}><input ref={commentInput} value={commentText} onChange={(event) => setCommentText(event.target.value)} placeholder="Write an encouraging comment..." maxLength={500} required /><button aria-label="Send comment"><Send size={15} /></button></form>
      </div>
    </Modal>}
  </>;
}
