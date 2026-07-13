/**
 * @streetstudio/comments
 *
 * Comments, threads, reactions, and mentions on videos. Comment/mention
 * authorization uses the media-domain `VIEW_VIDEO_PERMISSION`, so this package
 * depends on `@streetstudio/media`.
 */
export const DOMAIN = "Comments, threads, reactions, and mentions on videos." as const;

export {
  CommentService,
  repositoryCommentStore,
  POST_COMMENT_PERMISSION,
  COMMENT_BODY_MIN_LENGTH,
  COMMENT_BODY_MAX_LENGTH,
  MENTION_EVENT_TYPE,
} from "./comment.js";
export type {
  CommentServiceDeps,
  CommentStore,
  ReactionTarget,
  MentionNotifier,
} from "./comment.js";
