import { ENTITY_TYPES, type EntityType } from "@nema-io/shared";

export { ENTITY_TYPES, type EntityType };

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
  createdAt: string;
}

export interface FindRelatedDocumentsOptions {
  docId: string;
  userId: string;
  depth?: number;
  limit?: number;
}

export interface FindDocumentsByEntitiesOptions {
  entities: string[];
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

export interface GraphEntityWithCount extends GraphEntity {
  documentCount: number;
  lastReferencedAt?: string;
}

export interface ListEntitiesWithStatsOptions {
  userId: string;
  type?: EntityType;
}

export interface FindDocumentsByEntityOptions {
  userId: string;
  name: string;
  type: EntityType;
  limit?: number;
}

export interface GetRelatedEntitiesOptions {
  userId: string;
  name: string;
  type: EntityType;
  limit?: number;
}

export interface EntityTypeCount {
  type: EntityType;
  count: number;
}

export interface GraphEdge {
  sourceType: EntityType;
  sourceName: string;
  targetType: EntityType;
  targetName: string;
}

export interface GraphData {
  entities: GraphEntityWithCount[];
  edges: GraphEdge[];
}

export interface GetGraphOptions {
  userId: string;
}

export interface OrphanedEntity {
  userId: string;
  type: EntityType;
  name: string;
}

export interface FindEntitiesByNormalizedNamesOptions {
  userId: string;
  queries: Array<{ type: EntityType; normalizedName: string }>;
}

export interface NormalizedNameMatch extends GraphEntity {
  normalizedName: string;
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
  findEntitiesByNormalizedNames(
    options: FindEntitiesByNormalizedNamesOptions,
  ): Promise<NormalizedNameMatch[]>;
  listEntitiesWithStats(
    options: ListEntitiesWithStatsOptions,
  ): Promise<GraphEntityWithCount[]>;
  findDocumentsByEntity(
    options: FindDocumentsByEntityOptions,
  ): Promise<string[]>;
  getRelatedEntities(
    options: GetRelatedEntitiesOptions,
  ): Promise<GraphEntityWithCount[]>;
  getEntityCountsByType(userId: string): Promise<EntityTypeCount[]>;
  mergeEntities(options: MergeEntitiesOptions): Promise<void>;
  // userId 불필요 — Document 노드에 userId 없음. 접근 제어는 서비스 레이어 책임.
  deleteByDocument(docId: string): Promise<OrphanedEntity[]>;
  getGraph(options: GetGraphOptions): Promise<GraphData>;
}
