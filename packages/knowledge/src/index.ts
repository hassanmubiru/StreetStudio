/**
 * @streetstudio/knowledge
 *
 * Engineering knowledge that evolves independently of media bytes: transcript
 * indexing, summaries, documentation links, and knowledge-base entries — the
 * foundation of StreetStudio's engineering-memory / knowledge-graph vision
 * (see docs/PRODUCT.md).
 */
export const DOMAIN =
  "Engineering knowledge: transcript indexing, summaries, documentation links, and knowledge-base entries." as const;

export {
  KnowledgeBase,
  repositoryKnowledgeStore,
  LINK_DOC_PERMISSION,
  SUMMARY_BODY_MIN_LENGTH,
  SUMMARY_BODY_MAX_LENGTH,
  DOC_URL_MIN_LENGTH,
  DOC_URL_MAX_LENGTH,
  MAX_DOC_LINKS_PER_VIDEO,
} from "./knowledge-base.js";
export type {
  KnowledgeBaseDeps,
  KnowledgeStore,
  TranscriptIndexer,
  Transcript,
} from "./knowledge-base.js";
