export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      changes: {
        Row: {
          action: Database["public"]["Enums"]["change_action"];
          changeset_id: string;
          created_at: string;
          data: Json | null;
          id: string;
          target_id: string;
          target_type: Database["public"]["Enums"]["change_target_type"];
        };
        Insert: {
          action: Database["public"]["Enums"]["change_action"];
          changeset_id: string;
          created_at?: string;
          data?: Json | null;
          id?: string;
          target_id: string;
          target_type: Database["public"]["Enums"]["change_target_type"];
        };
        Update: {
          action?: Database["public"]["Enums"]["change_action"];
          changeset_id?: string;
          created_at?: string;
          data?: Json | null;
          id?: string;
          target_id?: string;
          target_type?: Database["public"]["Enums"]["change_target_type"];
        };
        Relationships: [
          {
            foreignKeyName: "changes_changeset_id_fkey";
            columns: ["changeset_id"];
            isOneToOne: false;
            referencedRelation: "changesets";
            referencedColumns: ["id"];
          },
        ];
      };
      changesets: {
        Row: {
          author_id: string | null;
          created_at: string;
          id: string;
          reverts_id: string | null;
          source_id: string | null;
          space_id: string | null;
          status: Database["public"]["Enums"]["changeset_status"];
          type: Database["public"]["Enums"]["changeset_type"];
          updated_at: string;
        };
        Insert: {
          author_id?: string | null;
          created_at?: string;
          id?: string;
          reverts_id?: string | null;
          source_id?: string | null;
          space_id?: string | null;
          status: Database["public"]["Enums"]["changeset_status"];
          type: Database["public"]["Enums"]["changeset_type"];
          updated_at?: string;
        };
        Update: {
          author_id?: string | null;
          created_at?: string;
          id?: string;
          reverts_id?: string | null;
          source_id?: string | null;
          space_id?: string | null;
          status?: Database["public"]["Enums"]["changeset_status"];
          type?: Database["public"]["Enums"]["changeset_type"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "changesets_reverts_id_fkey";
            columns: ["reverts_id"];
            isOneToOne: false;
            referencedRelation: "changesets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "changesets_source_id_fkey";
            columns: ["source_id"];
            isOneToOne: false;
            referencedRelation: "sources";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "changesets_space_id_fkey";
            columns: ["space_id"];
            isOneToOne: false;
            referencedRelation: "spaces";
            referencedColumns: ["id"];
          },
        ];
      };
      digest_links: {
        Row: {
          created_at: string;
          digest_a_id: string;
          digest_b_id: string;
        };
        Insert: {
          created_at?: string;
          digest_a_id: string;
          digest_b_id: string;
        };
        Update: {
          created_at?: string;
          digest_a_id?: string;
          digest_b_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "digest_links_digest_a_id_fkey";
            columns: ["digest_a_id"];
            isOneToOne: false;
            referencedRelation: "digests";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "digest_links_digest_b_id_fkey";
            columns: ["digest_b_id"];
            isOneToOne: false;
            referencedRelation: "digests";
            referencedColumns: ["id"];
          },
        ];
      };
      digest_references: {
        Row: {
          created_at: string;
          digest_id: string;
          reference_id: string;
        };
        Insert: {
          created_at?: string;
          digest_id: string;
          reference_id: string;
        };
        Update: {
          created_at?: string;
          digest_id?: string;
          reference_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "digest_references_digest_id_fkey";
            columns: ["digest_id"];
            isOneToOne: false;
            referencedRelation: "digests";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "digest_references_reference_id_fkey";
            columns: ["reference_id"];
            isOneToOne: false;
            referencedRelation: "references";
            referencedColumns: ["id"];
          },
        ];
      };
      digest_tags: {
        Row: {
          created_at: string;
          digest_id: string;
          tag_id: string;
        };
        Insert: {
          created_at?: string;
          digest_id: string;
          tag_id: string;
        };
        Update: {
          created_at?: string;
          digest_id?: string;
          tag_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "digest_tags_digest_id_fkey";
            columns: ["digest_id"];
            isOneToOne: false;
            referencedRelation: "digests";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "digest_tags_tag_id_fkey";
            columns: ["tag_id"];
            isOneToOne: false;
            referencedRelation: "tags";
            referencedColumns: ["id"];
          },
        ];
      };
      digest_topics: {
        Row: {
          created_at: string;
          digest_id: string;
          topic_id: string;
        };
        Insert: {
          created_at?: string;
          digest_id: string;
          topic_id: string;
        };
        Update: {
          created_at?: string;
          digest_id?: string;
          topic_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "digest_topics_digest_id_fkey";
            columns: ["digest_id"];
            isOneToOne: false;
            referencedRelation: "digests";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "digest_topics_topic_id_fkey";
            columns: ["topic_id"];
            isOneToOne: false;
            referencedRelation: "topics";
            referencedColumns: ["id"];
          },
        ];
      };
      digests: {
        Row: {
          author_id: string | null;
          body: Json;
          created_at: string;
          description: string;
          external_urls: string[] | null;
          id: string;
          locator: Json | null;
          source_id: string;
          space_id: string;
          status: Database["public"]["Enums"]["digest_status"];
          title: string;
          updated_at: string;
        };
        Insert: {
          author_id?: string | null;
          body: Json;
          created_at?: string;
          description: string;
          external_urls?: string[] | null;
          id?: string;
          locator?: Json | null;
          source_id: string;
          space_id: string;
          status?: Database["public"]["Enums"]["digest_status"];
          title: string;
          updated_at?: string;
        };
        Update: {
          author_id?: string | null;
          body?: Json;
          created_at?: string;
          description?: string;
          external_urls?: string[] | null;
          id?: string;
          locator?: Json | null;
          source_id?: string;
          space_id?: string;
          status?: Database["public"]["Enums"]["digest_status"];
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "digests_source_id_fkey";
            columns: ["source_id"];
            isOneToOne: false;
            referencedRelation: "sources";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "digests_space_id_fkey";
            columns: ["space_id"];
            isOneToOne: false;
            referencedRelation: "spaces";
            referencedColumns: ["id"];
          },
        ];
      };
      drafts: {
        Row: {
          author_id: string | null;
          body: string;
          created_at: string;
          id: string;
          origin: Database["public"]["Enums"]["draft_origin"];
          proposed_topics: string[];
          space_id: string;
          title: string | null;
          updated_at: string;
        };
        Insert: {
          author_id?: string | null;
          body?: string;
          created_at?: string;
          id?: string;
          origin: Database["public"]["Enums"]["draft_origin"];
          proposed_topics?: string[];
          space_id: string;
          title?: string | null;
          updated_at?: string;
        };
        Update: {
          author_id?: string | null;
          body?: string;
          created_at?: string;
          id?: string;
          origin?: Database["public"]["Enums"]["draft_origin"];
          proposed_topics?: string[];
          space_id?: string;
          title?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "drafts_space_id_fkey";
            columns: ["space_id"];
            isOneToOne: false;
            referencedRelation: "spaces";
            referencedColumns: ["id"];
          },
        ];
      };
      eval_runs: {
        Row: {
          cost_usd: number | null;
          created_at: string;
          eval_version: string;
          id: string;
          latency_ms: number;
          model: string;
          prompt_version: string;
          provider: string;
          quality_score: number | null;
          run_at: string;
          self_preference: boolean;
          signals: Json;
          task: string;
        };
        Insert: {
          cost_usd?: number | null;
          created_at?: string;
          eval_version: string;
          id?: string;
          latency_ms: number;
          model: string;
          prompt_version: string;
          provider: string;
          quality_score?: number | null;
          run_at: string;
          self_preference?: boolean;
          signals?: Json;
          task: string;
        };
        Update: {
          cost_usd?: number | null;
          created_at?: string;
          eval_version?: string;
          id?: string;
          latency_ms?: number;
          model?: string;
          prompt_version?: string;
          provider?: string;
          quality_score?: number | null;
          run_at?: string;
          self_preference?: boolean;
          signals?: Json;
          task?: string;
        };
        Relationships: [];
      };
      events: {
        Row: {
          created_at: string;
          id: string;
          payload: Json;
          session_id: string | null;
          type: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          payload?: Json;
          session_id?: string | null;
          type: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          payload?: Json;
          session_id?: string | null;
          type?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "events_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          content_language: string;
          created_at: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          content_language?: string;
          created_at?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          content_language?: string;
          created_at?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      reference_links: {
        Row: {
          created_at: string;
          reference_a_id: string;
          reference_b_id: string;
        };
        Insert: {
          created_at?: string;
          reference_a_id: string;
          reference_b_id: string;
        };
        Update: {
          created_at?: string;
          reference_a_id?: string;
          reference_b_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reference_links_reference_a_id_fkey";
            columns: ["reference_a_id"];
            isOneToOne: false;
            referencedRelation: "references";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reference_links_reference_b_id_fkey";
            columns: ["reference_b_id"];
            isOneToOne: false;
            referencedRelation: "references";
            referencedColumns: ["id"];
          },
        ];
      };
      references: {
        Row: {
          body: string;
          created_at: string;
          external_urls: string[] | null;
          id: string;
          status: Database["public"]["Enums"]["reference_status"];
          title: string;
          type: Database["public"]["Enums"]["reference_type"];
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          body: string;
          created_at?: string;
          external_urls?: string[] | null;
          id?: string;
          status?: Database["public"]["Enums"]["reference_status"];
          title: string;
          type: Database["public"]["Enums"]["reference_type"];
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          body?: string;
          created_at?: string;
          external_urls?: string[] | null;
          id?: string;
          status?: Database["public"]["Enums"]["reference_status"];
          title?: string;
          type?: Database["public"]["Enums"]["reference_type"];
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "references_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      session_retrievals: {
        Row: {
          body: string;
          created_at: string;
          documents: Json;
          id: string;
          query: string;
          session_id: string;
          updated_at: string;
        };
        Insert: {
          body: string;
          created_at?: string;
          documents?: Json;
          id?: string;
          query: string;
          session_id: string;
          updated_at?: string;
        };
        Update: {
          body?: string;
          created_at?: string;
          documents?: Json;
          id?: string;
          query?: string;
          session_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "session_retrievals_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      sessions: {
        Row: {
          created_at: string;
          draft: Json | null;
          id: string;
          messages: Json;
          title: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          draft?: Json | null;
          id?: string;
          messages?: Json;
          title?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          draft?: Json | null;
          id?: string;
          messages?: Json;
          title?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      source_topics: {
        Row: {
          created_at: string;
          source_id: string;
          topic_id: string;
        };
        Insert: {
          created_at?: string;
          source_id: string;
          topic_id: string;
        };
        Update: {
          created_at?: string;
          source_id?: string;
          topic_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "source_topics_source_id_fkey";
            columns: ["source_id"];
            isOneToOne: false;
            referencedRelation: "sources";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "source_topics_topic_id_fkey";
            columns: ["topic_id"];
            isOneToOne: false;
            referencedRelation: "topics";
            referencedColumns: ["id"];
          },
        ];
      };
      sources: {
        Row: {
          author_id: string | null;
          author_timezone: string | null;
          body: string;
          created_at: string;
          digestion_retry_count: number;
          digestion_status: Database["public"]["Enums"]["ingestion_status"];
          error_message: string | null;
          extraction_retry_count: number;
          extraction_status: Database["public"]["Enums"]["ingestion_status"];
          id: string;
          last_digestion_attempt: string | null;
          last_extraction_attempt: string | null;
          last_linking_attempt: string | null;
          linking_retry_count: number;
          linking_status: Database["public"]["Enums"]["ingestion_status"];
          session_id: string | null;
          space_id: string;
          status: Database["public"]["Enums"]["source_status"];
          title: string | null;
          trashed_at: string | null;
          updated_at: string;
        };
        Insert: {
          author_id?: string | null;
          author_timezone?: string | null;
          body: string;
          created_at?: string;
          digestion_retry_count?: number;
          digestion_status?: Database["public"]["Enums"]["ingestion_status"];
          error_message?: string | null;
          extraction_retry_count?: number;
          extraction_status?: Database["public"]["Enums"]["ingestion_status"];
          id?: string;
          last_digestion_attempt?: string | null;
          last_extraction_attempt?: string | null;
          last_linking_attempt?: string | null;
          linking_retry_count?: number;
          linking_status?: Database["public"]["Enums"]["ingestion_status"];
          session_id?: string | null;
          space_id: string;
          status?: Database["public"]["Enums"]["source_status"];
          title?: string | null;
          trashed_at?: string | null;
          updated_at?: string;
        };
        Update: {
          author_id?: string | null;
          author_timezone?: string | null;
          body?: string;
          created_at?: string;
          digestion_retry_count?: number;
          digestion_status?: Database["public"]["Enums"]["ingestion_status"];
          error_message?: string | null;
          extraction_retry_count?: number;
          extraction_status?: Database["public"]["Enums"]["ingestion_status"];
          id?: string;
          last_digestion_attempt?: string | null;
          last_extraction_attempt?: string | null;
          last_linking_attempt?: string | null;
          linking_retry_count?: number;
          linking_status?: Database["public"]["Enums"]["ingestion_status"];
          session_id?: string | null;
          space_id?: string;
          status?: Database["public"]["Enums"]["source_status"];
          title?: string | null;
          trashed_at?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sources_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sources_space_id_fkey";
            columns: ["space_id"];
            isOneToOne: false;
            referencedRelation: "spaces";
            referencedColumns: ["id"];
          },
        ];
      };
      space_members: {
        Row: {
          created_at: string;
          role: Database["public"]["Enums"]["space_role"];
          space_id: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          role: Database["public"]["Enums"]["space_role"];
          space_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          role?: Database["public"]["Enums"]["space_role"];
          space_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "space_members_space_id_fkey";
            columns: ["space_id"];
            isOneToOne: false;
            referencedRelation: "spaces";
            referencedColumns: ["id"];
          },
        ];
      };
      spaces: {
        Row: {
          created_at: string;
          id: string;
          name: string | null;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name?: string | null;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string | null;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "spaces_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      statement_references: {
        Row: {
          created_at: string;
          reference_id: string;
          statement_id: string;
        };
        Insert: {
          created_at?: string;
          reference_id: string;
          statement_id: string;
        };
        Update: {
          created_at?: string;
          reference_id?: string;
          statement_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "statement_references_reference_id_fkey";
            columns: ["reference_id"];
            isOneToOne: false;
            referencedRelation: "references";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "statement_references_statement_id_fkey";
            columns: ["statement_id"];
            isOneToOne: false;
            referencedRelation: "statements";
            referencedColumns: ["id"];
          },
        ];
      };
      statement_relations: {
        Row: {
          created_at: string;
          from_id: string;
          id: string;
          space_id: string;
          status: Database["public"]["Enums"]["relation_status"];
          to_id: string;
          type: Database["public"]["Enums"]["relation_type"];
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          from_id: string;
          id?: string;
          space_id: string;
          status?: Database["public"]["Enums"]["relation_status"];
          to_id: string;
          type: Database["public"]["Enums"]["relation_type"];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          from_id?: string;
          id?: string;
          space_id?: string;
          status?: Database["public"]["Enums"]["relation_status"];
          to_id?: string;
          type?: Database["public"]["Enums"]["relation_type"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "statement_relations_from_id_fkey";
            columns: ["from_id"];
            isOneToOne: false;
            referencedRelation: "statements";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "statement_relations_space_id_fkey";
            columns: ["space_id"];
            isOneToOne: false;
            referencedRelation: "spaces";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "statement_relations_to_id_fkey";
            columns: ["to_id"];
            isOneToOne: false;
            referencedRelation: "statements";
            referencedColumns: ["id"];
          },
        ];
      };
      statement_sources: {
        Row: {
          created_at: string;
          locator: Json | null;
          source_id: string;
          statement_id: string;
        };
        Insert: {
          created_at?: string;
          locator?: Json | null;
          source_id: string;
          statement_id: string;
        };
        Update: {
          created_at?: string;
          locator?: Json | null;
          source_id?: string;
          statement_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "statement_sources_source_id_fkey";
            columns: ["source_id"];
            isOneToOne: false;
            referencedRelation: "sources";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "statement_sources_statement_id_fkey";
            columns: ["statement_id"];
            isOneToOne: false;
            referencedRelation: "statements";
            referencedColumns: ["id"];
          },
        ];
      };
      statements: {
        Row: {
          confidence:
            | Database["public"]["Enums"]["statement_confidence"]
            | null;
          content: string;
          created_at: string;
          digest_id: string | null;
          due_date: string | null;
          duplicate_of: string | null;
          error_message: string | null;
          id: string;
          ingestion_retry_count: number;
          ingestion_status: Database["public"]["Enums"]["ingestion_status"];
          last_ingestion_attempt: string | null;
          space_id: string;
          status: Database["public"]["Enums"]["statement_status"];
          type: Database["public"]["Enums"]["statement_type"];
          updated_at: string;
        };
        Insert: {
          confidence?:
            | Database["public"]["Enums"]["statement_confidence"]
            | null;
          content: string;
          created_at?: string;
          digest_id?: string | null;
          due_date?: string | null;
          duplicate_of?: string | null;
          error_message?: string | null;
          id?: string;
          ingestion_retry_count?: number;
          ingestion_status?: Database["public"]["Enums"]["ingestion_status"];
          last_ingestion_attempt?: string | null;
          space_id: string;
          status?: Database["public"]["Enums"]["statement_status"];
          type: Database["public"]["Enums"]["statement_type"];
          updated_at?: string;
        };
        Update: {
          confidence?:
            | Database["public"]["Enums"]["statement_confidence"]
            | null;
          content?: string;
          created_at?: string;
          digest_id?: string | null;
          due_date?: string | null;
          duplicate_of?: string | null;
          error_message?: string | null;
          id?: string;
          ingestion_retry_count?: number;
          ingestion_status?: Database["public"]["Enums"]["ingestion_status"];
          last_ingestion_attempt?: string | null;
          space_id?: string;
          status?: Database["public"]["Enums"]["statement_status"];
          type?: Database["public"]["Enums"]["statement_type"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "statements_digest_id_fkey";
            columns: ["digest_id"];
            isOneToOne: false;
            referencedRelation: "digests";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "statements_duplicate_of_fkey";
            columns: ["duplicate_of"];
            isOneToOne: false;
            referencedRelation: "statements";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "statements_space_id_fkey";
            columns: ["space_id"];
            isOneToOne: false;
            referencedRelation: "spaces";
            referencedColumns: ["id"];
          },
        ];
      };
      tags: {
        Row: {
          created_at: string;
          description: string;
          id: string;
          status: Database["public"]["Enums"]["tag_status"];
          title: string;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          description: string;
          id?: string;
          status?: Database["public"]["Enums"]["tag_status"];
          title: string;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          description?: string;
          id?: string;
          status?: Database["public"]["Enums"]["tag_status"];
          title?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tags_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      topics: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          space_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          space_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          space_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "topics_space_id_fkey";
            columns: ["space_id"];
            isOneToOne: false;
            referencedRelation: "spaces";
            referencedColumns: ["id"];
          },
        ];
      };
      workspace_members: {
        Row: {
          created_at: string;
          role: Database["public"]["Enums"]["workspace_role"];
          updated_at: string;
          user_id: string;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          role: Database["public"]["Enums"]["workspace_role"];
          updated_at?: string;
          user_id: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          role?: Database["public"]["Enums"]["workspace_role"];
          updated_at?: string;
          user_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      workspaces: {
        Row: {
          created_at: string;
          id: string;
          name: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      ack_sync_event: { Args: { p_msg_id: number }; Returns: undefined };
      append_message: {
        Args: { p_message: Json; p_session_id: string };
        Returns: undefined;
      };
      apply_ingestion_changeset: {
        Args: { p_source_id: string; p_statements: Json };
        Returns: string;
      };
      apply_pending_relation: {
        Args: { p_changeset_id: string };
        Returns: string;
      };
      apply_relation_changesets: {
        Args: {
          p_applied?: Json;
          p_duplicates?: Json;
          p_pending?: Json;
          p_source_id: string;
        };
        Returns: undefined;
      };
      archive_statement: {
        Args: { p_statement_id: string };
        Returns: undefined;
      };
      complete_source_digestion: {
        Args: { p_source_id: string };
        Returns: undefined;
      };
      complete_source_extraction: {
        Args: { p_source_id: string };
        Returns: undefined;
      };
      complete_statement_ingestion: {
        Args: { p_statement_id: string };
        Returns: undefined;
      };
      confirm_draft: {
        Args: { p_draft_id: string; p_title: string; p_topics: string[] };
        Returns: string;
      };
      confirm_ingestion_review: {
        Args: { p_changeset_id: string };
        Returns: string;
      };
      create_draft: {
        Args: {
          p_body: string;
          p_origin: Database["public"]["Enums"]["draft_origin"];
          p_proposed_topics?: string[];
          p_space_id: string;
          p_title?: string;
        };
        Returns: string;
      };
      create_ingestion_review: {
        Args: { p_digests: Json; p_new_references?: Json; p_source_id: string };
        Returns: string;
      };
      create_source: {
        Args: {
          p_author_timezone?: string;
          p_body: string;
          p_session_id?: string;
          p_space_id: string;
        };
        Returns: string;
      };
      delete_draft: { Args: { p_draft_id: string }; Returns: undefined };
      fetch_pending_digestion_sources: {
        Args: { p_max_retries?: number };
        Returns: {
          author_id: string;
          body: string;
          created_at: string;
          id: string;
          space_id: string;
          workspace_id: string;
        }[];
      };
      fetch_pending_linking_sources: {
        Args: { p_max_retries?: number };
        Returns: {
          created_at: string;
          id: string;
          space_id: string;
        }[];
      };
      fetch_pending_sources: {
        Args: { p_max_retries?: number };
        Returns: {
          author_id: string;
          author_timezone: string;
          body: string;
          created_at: string;
          id: string;
          session_id: string;
          space_id: string;
        }[];
      };
      fetch_pending_statements: {
        Args: { p_max_retries?: number };
        Returns: {
          confidence: Database["public"]["Enums"]["statement_confidence"];
          content: string;
          created_at: string;
          id: string;
          space_id: string;
          status: Database["public"]["Enums"]["statement_status"];
          type: Database["public"]["Enums"]["statement_type"];
        }[];
      };
      increment_source_digestion_retry: {
        Args: {
          p_error_message?: string;
          p_max_retries?: number;
          p_source_id: string;
        };
        Returns: undefined;
      };
      increment_source_extraction_retry: {
        Args: {
          p_error_message?: string;
          p_max_retries?: number;
          p_source_id: string;
        };
        Returns: undefined;
      };
      increment_source_linking_retry: {
        Args: {
          p_error_message?: string;
          p_max_retries?: number;
          p_source_id: string;
        };
        Returns: undefined;
      };
      increment_statement_ingestion_retry: {
        Args: {
          p_error_message?: string;
          p_max_retries?: number;
          p_statement_id: string;
        };
        Returns: undefined;
      };
      is_changeset_reverted: {
        Args: { p_changeset_id: string };
        Returns: boolean;
      };
      is_space_member: { Args: { p_space_id: string }; Returns: boolean };
      is_workspace_member: {
        Args: { p_workspace_id: string };
        Returns: boolean;
      };
      read_sync_events: {
        Args: { p_batch_size?: number; p_visibility_timeout?: number };
        Returns: {
          message: Json;
          msg_id: number;
          read_ct: number;
        }[];
      };
      reject_pending_relation: {
        Args: { p_changeset_id: string };
        Returns: undefined;
      };
      restore_trashed_source: {
        Args: { p_source_id: string };
        Returns: undefined;
      };
      retry_source_digestion: {
        Args: { p_source_id: string };
        Returns: undefined;
      };
      retry_source_extraction: {
        Args: { p_source_id: string };
        Returns: undefined;
      };
      retry_source_linking: {
        Args: { p_source_id: string };
        Returns: undefined;
      };
      retry_statement_ingestion: {
        Args: { p_statement_id: string };
        Returns: undefined;
      };
      revert_changeset: { Args: { p_changeset_id: string }; Returns: string };
      show_limit: { Args: never; Returns: number };
      show_trgm: { Args: { "": string }; Returns: string[] };
      trash_source: { Args: { p_source_id: string }; Returns: undefined };
      update_draft: {
        Args: {
          p_body?: string;
          p_draft_id: string;
          p_proposed_topics?: string[];
          p_title?: string;
        };
        Returns: undefined;
      };
      update_message_payload: {
        Args: { p_message_id: string; p_payload: Json; p_session_id: string };
        Returns: undefined;
      };
      update_pending_ingestion: {
        Args: {
          p_changeset_id: string;
          p_digests: Json;
          p_new_references?: Json;
        };
        Returns: undefined;
      };
      write_ingestion_review_changes: {
        Args: {
          p_changeset_id: string;
          p_digests: Json;
          p_new_references: Json;
        };
        Returns: undefined;
      };
    };
    Enums: {
      change_action: "create" | "archive" | "modify" | "restore";
      change_target_type:
        | "statement"
        | "relation"
        | "source"
        | "digest"
        | "reference";
      changeset_status: "pending" | "applied" | "rejected";
      changeset_type: "ingestion" | "relation" | "manual" | "revert";
      digest_status: "active" | "archived";
      draft_origin: "in_app" | "external";
      ingestion_status: "pending" | "completed" | "failed";
      reference_status: "active" | "archived";
      reference_type:
        | "person"
        | "organization"
        | "project"
        | "product"
        | "term";
      relation_status: "active" | "archived";
      relation_type:
        | "supports"
        | "conflicts"
        | "replaces"
        | "resolves"
        | "duplicates";
      source_status: "pending" | "active" | "trashed";
      space_role: "owner" | "member";
      statement_confidence: "certain" | "guess";
      statement_status: "active" | "archived";
      statement_type: "claim" | "question" | "todo";
      tag_status: "active" | "archived";
      workspace_role: "owner" | "member";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      change_action: ["create", "archive", "modify", "restore"],
      change_target_type: [
        "statement",
        "relation",
        "source",
        "digest",
        "reference",
      ],
      changeset_status: ["pending", "applied", "rejected"],
      changeset_type: ["ingestion", "relation", "manual", "revert"],
      digest_status: ["active", "archived"],
      draft_origin: ["in_app", "external"],
      ingestion_status: ["pending", "completed", "failed"],
      reference_status: ["active", "archived"],
      reference_type: ["person", "organization", "project", "product", "term"],
      relation_status: ["active", "archived"],
      relation_type: [
        "supports",
        "conflicts",
        "replaces",
        "resolves",
        "duplicates",
      ],
      source_status: ["pending", "active", "trashed"],
      space_role: ["owner", "member"],
      statement_confidence: ["certain", "guess"],
      statement_status: ["active", "archived"],
      statement_type: ["claim", "question", "todo"],
      tag_status: ["active", "archived"],
      workspace_role: ["owner", "member"],
    },
  },
} as const;
