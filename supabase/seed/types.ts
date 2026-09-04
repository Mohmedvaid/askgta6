export type SeedAccount = {
  username: string;
  display_name: string | null;
  bio: string | null;
  created_at: string;
  /** Documentation only. Nothing imports this. */
  persona?: string;
};

export type SeedPost = {
  id: string;
  author: string;
  group: string | null;
  topic: string;
  kind: string;
  title: string;
  body: string;
  spoiler_level: number;
  created_at: string;
  upvotes: number;
  downvotes: number;
  accepted_reply_id: string | null;
};

export type SeedReply = {
  id: string;
  post_id: string;
  author: string;
  body: string;
  spoiler_level: number;
  created_at: string;
  upvotes: number;
  downvotes: number;
};

export type SeedFile = {
  accounts: SeedAccount[];
  posts: SeedPost[];
  replies: SeedReply[];
};
