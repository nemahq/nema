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
      histories: {
        Row: {
          created_at: string;
          id: string;
          source_draft_body: string;
          source_session_id: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          source_draft_body: string;
          source_session_id?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          source_draft_body?: string;
          source_session_id?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "histories_source_session_id_fkey";
            columns: ["source_session_id"];
            isOneToOne: false;
            referencedRelation: "sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      memories: {
        Row: {
          body: string;
          category: string | null;
          created_at: string;
          id: string;
          ingestion_retry_count: number;
          ingestion_status: Database["public"]["Enums"]["ingestion_status"];
          last_ingestion_attempt: string | null;
          summary: string | null;
          tags: string[] | null;
          title: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          body: string;
          category?: string | null;
          created_at?: string;
          id?: string;
          ingestion_retry_count?: number;
          ingestion_status?: Database["public"]["Enums"]["ingestion_status"];
          last_ingestion_attempt?: string | null;
          summary?: string | null;
          tags?: string[] | null;
          title?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          body?: string;
          category?: string | null;
          created_at?: string;
          id?: string;
          ingestion_retry_count?: number;
          ingestion_status?: Database["public"]["Enums"]["ingestion_status"];
          last_ingestion_attempt?: string | null;
          summary?: string | null;
          tags?: string[] | null;
          title?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      memory_revisions: {
        Row: {
          created_at: string;
          history_id: string;
          id: string;
          memory_id: string;
          next_body: string;
          prev_body: string | null;
          source: Database["public"]["Enums"]["revision_source"];
          update_type: Database["public"]["Enums"]["update_type"];
        };
        Insert: {
          created_at?: string;
          history_id: string;
          id?: string;
          memory_id: string;
          next_body: string;
          prev_body?: string | null;
          source: Database["public"]["Enums"]["revision_source"];
          update_type: Database["public"]["Enums"]["update_type"];
        };
        Update: {
          created_at?: string;
          history_id?: string;
          id?: string;
          memory_id?: string;
          next_body?: string;
          prev_body?: string | null;
          source?: Database["public"]["Enums"]["revision_source"];
          update_type?: Database["public"]["Enums"]["update_type"];
        };
        Relationships: [
          {
            foreignKeyName: "memory_revisions_history_id_fkey";
            columns: ["history_id"];
            isOneToOne: false;
            referencedRelation: "histories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "memory_revisions_memory_id_fkey";
            columns: ["memory_id"];
            isOneToOne: false;
            referencedRelation: "memories";
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
      save_jobs: {
        Row: {
          created_at: string;
          draft_body: string;
          error_message: string | null;
          history_id: string | null;
          id: string;
          session_id: string;
          snippet: string | null;
          status: Database["public"]["Enums"]["save_job_status"];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          draft_body: string;
          error_message?: string | null;
          history_id?: string | null;
          id?: string;
          session_id: string;
          snippet?: string | null;
          status?: Database["public"]["Enums"]["save_job_status"];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          draft_body?: string;
          error_message?: string | null;
          history_id?: string | null;
          id?: string;
          session_id?: string;
          snippet?: string | null;
          status?: Database["public"]["Enums"]["save_job_status"];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "save_jobs_history_id_fkey";
            columns: ["history_id"];
            isOneToOne: false;
            referencedRelation: "histories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "save_jobs_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "sessions";
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
      complete_memory_ingestion: {
        Args: { p_memory_id: string };
        Returns: undefined;
      };
      create_memory_with_revision: {
        Args: {
          p_body: string;
          p_category: string;
          p_history_id: string;
          p_summary: string;
          p_tags: string[];
          p_title: string;
          p_user_id: string;
        };
        Returns: string;
      };
      fail_stale_save_jobs: { Args: never; Returns: number };
      fetch_pending_memories: {
        Args: { p_max_retries?: number };
        Returns: {
          body: string;
          created_at: string;
          id: string;
          summary: string;
          tags: string[];
          user_id: string;
        }[];
      };
      get_unique_tags: { Args: { p_user_id: string }; Returns: string[] };
      increment_memory_ingestion_retry: {
        Args: { p_max_retries?: number; p_memory_id: string };
        Returns: undefined;
      };
      list_memory_user_ids: {
        Args: never;
        Returns: {
          user_id: string;
        }[];
      };
      read_sync_events: {
        Args: { p_batch_size?: number; p_visibility_timeout?: number };
        Returns: {
          message: Json;
          msg_id: number;
          read_ct: number;
        }[];
      };
      show_limit: { Args: never; Returns: number };
      show_trgm: { Args: { "": string }; Returns: string[] };
      update_memory_with_revision: {
        Args: {
          p_body: string;
          p_category: string;
          p_history_id: string;
          p_memory_id: string;
          p_summary: string;
          p_tags: string[];
          p_title: string;
          p_update_type: Database["public"]["Enums"]["update_type"];
          p_user_id: string;
        };
        Returns: undefined;
      };
      update_message_payload: {
        Args: { p_message_id: string; p_payload: Json; p_session_id: string };
        Returns: undefined;
      };
    };
    Enums: {
      ingestion_status: "pending" | "completed" | "failed";
      revision_source: "direct" | "regeneration";
      save_job_status: "pending" | "processing" | "completed" | "failed";
      update_type: "create" | "extend" | "replace";
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
      ingestion_status: ["pending", "completed", "failed"],
      revision_source: ["direct", "regeneration"],
      save_job_status: ["pending", "processing", "completed", "failed"],
      update_type: ["create", "extend", "replace"],
    },
  },
} as const;
