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

export type EntityType =
  | "Person"
  | "Organization"
  | "Topic"
  | "Event"
  | "Project"
  | "Location";

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
  deleteByDocument(docId: string): Promise<void>;
}
