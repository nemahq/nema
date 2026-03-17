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
      documents: {
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
      save_jobs: {
        Row: {
          created_at: string;
          draft_body: string;
          error_message: string | null;
          id: string;
          session_id: string;
          status: Database["public"]["Enums"]["save_job_status"];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          draft_body: string;
          error_message?: string | null;
          id?: string;
          session_id: string;
          status?: Database["public"]["Enums"]["save_job_status"];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          draft_body?: string;
          error_message?: string | null;
          id?: string;
          session_id?: string;
          status?: Database["public"]["Enums"]["save_job_status"];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "save_jobs_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      session_documents: {
        Row: {
          created_at: string;
          document_id: string;
          session_id: string;
        };
        Insert: {
          created_at?: string;
          document_id: string;
          session_id: string;
        };
        Update: {
          created_at?: string;
          document_id?: string;
          session_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "session_documents_document_id_fkey";
            columns: ["document_id"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "session_documents_session_id_fkey";
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
      create_document_with_event: {
        Args: {
          p_body: string;
          p_session_id: string;
          p_summary: string;
          p_tags: string[];
          p_title: string;
          p_user_id: string;
        };
        Returns: string;
      };
      delete_document_with_event: {
        Args: { p_doc_id: string; p_user_id: string };
        Returns: undefined;
      };
      fail_stale_save_jobs: { Args: never; Returns: number };
      fetch_pending_documents: {
        Args: { p_max_retries?: number };
        Returns: {
          body: string;
          id: string;
          summary: string;
          tags: string[];
          user_id: string;
        }[];
      };
      increment_ingestion_retry: {
        Args: { p_doc_id: string; p_max_retries?: number };
        Returns: undefined;
      };
      read_sync_events: {
        Args: { p_batch_size?: number; p_visibility_timeout?: number };
        Returns: {
          message: Json;
          msg_id: number;
          read_ct: number;
        }[];
      };
      update_document_with_event: {
        Args: {
          p_body: string;
          p_doc_id: string;
          p_summary: string;
          p_tags: string[];
          p_title: string;
          p_user_id: string;
        };
        Returns: undefined;
      };
    };
    Enums: {
      ingestion_status: "pending" | "completed" | "failed";
      save_job_status: "pending" | "processing" | "completed" | "failed";
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
      save_job_status: ["pending", "processing", "completed", "failed"],
    },
  },
} as const;
