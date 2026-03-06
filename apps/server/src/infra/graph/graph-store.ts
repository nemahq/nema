export class GraphStoreError extends Error {
  constructor(
    message: string,
    public readonly operation: string,
    cause?: unknown,
  ) {
    super(message, { cause });
    this.name = "GraphStoreError";
  }
}

export const ENTITY_TYPES = [
  "Person",
  "Organization",
  "Topic",
  "Event",
  "Project",
  "Location",
] as const;

export type EntityType = (typeof ENTITY_TYPES)[number];

export interface GraphEntity {
  type: EntityType;
  name: string;
}

export interface GraphSearchResult {
  docId: string;
  sharedEntityCount: number;
}

export interface UpsertEntitiesOptions {
  docId: string;
  userId: string;
  entities: GraphEntity[];
}

export interface FindRelatedDocumentsOptions {
  docId: string;
  userId: string;
  depth?: number;
  limit?: number;
}

export interface FindDocumentsByEntitiesOptions {
  entityNames: string[];
  userId: string;
  limit?: number;
}

export interface ListEntitiesOptions {
  userId: string;
  type?: EntityType;
  limit?: number;
  offset?: number;
}

export interface MergeEntitiesOptions {
  userId: string;
  targetName: string;
  sourceNames: string[];
  type: EntityType;
}

export interface GraphStore {
  ensureSchema(): Promise<void>;
  upsertEntities(options: UpsertEntitiesOptions): Promise<void>;
  findRelatedDocuments(
    options: FindRelatedDocumentsOptions,
  ): Promise<GraphSearchResult[]>;
  findDocumentsByEntities(
    options: FindDocumentsByEntitiesOptions,
  ): Promise<GraphSearchResult[]>;
  listEntities(options: ListEntitiesOptions): Promise<GraphEntity[]>;
  mergeEntities(options: MergeEntitiesOptions): Promise<void>;
  // userId 불필요 — Document 노드에 userId 없음. 접근 제어는 서비스 레이어 책임.
  deleteByDocument(docId: string): Promise<void>;
}
