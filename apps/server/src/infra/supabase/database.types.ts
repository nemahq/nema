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
      digest_relations: {
        Row: {
          created_at: string;
          from_digest_id: string;
          id: string;
          to_digest_id: string;
          type: Database["public"]["Enums"]["digest_relation_type"];
        };
        Insert: {
          created_at?: string;
          from_digest_id: string;
          id?: string;
          to_digest_id: string;
          type: Database["public"]["Enums"]["digest_relation_type"];
        };
        Update: {
          created_at?: string;
          from_digest_id?: string;
          id?: string;
          to_digest_id?: string;
          type?: Database["public"]["Enums"]["digest_relation_type"];
        };
        Relationships: [
          {
            foreignKeyName: "digest_relations_from_digest_id_fkey";
            columns: ["from_digest_id"];
            isOneToOne: false;
            referencedRelation: "digests";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "digest_relations_to_digest_id_fkey";
            columns: ["to_digest_id"];
            isOneToOne: false;
            referencedRelation: "digests";
            referencedColumns: ["id"];
          },
        ];
      };
      digests: {
        Row: {
          body: Json;
          created_at: string;
          extraction_order: number;
          hidden_at: string | null;
          id: string;
          source_id: string;
          title: string;
          type: Database["public"]["Enums"]["digest_type"];
          updated_at: string;
        };
        Insert: {
          body: Json;
          created_at?: string;
          extraction_order: number;
          hidden_at?: string | null;
          id?: string;
          source_id: string;
          title: string;
          type: Database["public"]["Enums"]["digest_type"];
          updated_at?: string;
        };
        Update: {
          body?: Json;
          created_at?: string;
          extraction_order?: number;
          hidden_at?: string | null;
          id?: string;
          source_id?: string;
          title?: string;
          type?: Database["public"]["Enums"]["digest_type"];
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
            foreignKeyName: "digests_source_id_fkey";
            columns: ["source_id"];
            isOneToOne: false;
            referencedRelation: "v_draft_sources";
            referencedColumns: ["id"];
          },
        ];
      };
      mcp_tool_calls: {
        Row: {
          created_at: string;
          detail: Json;
          id: string;
          tool: Database["public"]["Enums"]["mcp_tool"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          detail: Json;
          id?: string;
          tool: Database["public"]["Enums"]["mcp_tool"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          detail?: Json;
          id?: string;
          tool?: Database["public"]["Enums"]["mcp_tool"];
          user_id?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          content_language: Database["public"]["Enums"]["content_language"];
          created_at: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          content_language?: Database["public"]["Enums"]["content_language"];
          created_at?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          content_language?: Database["public"]["Enums"]["content_language"];
          created_at?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      relation_judgments: {
        Row: {
          candidates: Json;
          created_at: string;
          digest_id: string;
          id: string;
          user_id: string;
        };
        Insert: {
          candidates: Json;
          created_at?: string;
          digest_id: string;
          id?: string;
          user_id: string;
        };
        Update: {
          candidates?: Json;
          created_at?: string;
          digest_id?: string;
          id?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      sources: {
        Row: {
          body: string;
          created_at: string;
          digestion_status: Database["public"]["Enums"]["digestion_status"];
          id: string;
          name: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          body: string;
          created_at?: string;
          digestion_status?: Database["public"]["Enums"]["digestion_status"];
          id?: string;
          name?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          body?: string;
          created_at?: string;
          digestion_status?: Database["public"]["Enums"]["digestion_status"];
          id?: string;
          name?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      v_draft_sources: {
        Row: {
          created_at: string | null;
          digestion_status:
            | Database["public"]["Enums"]["digestion_status"]
            | null;
          id: string | null;
          name: string | null;
        };
        Insert: {
          created_at?: string | null;
          digestion_status?:
            | Database["public"]["Enums"]["digestion_status"]
            | null;
          id?: string | null;
          name?: string | null;
        };
        Update: {
          created_at?: string | null;
          digestion_status?:
            | Database["public"]["Enums"]["digestion_status"]
            | null;
          id?: string | null;
          name?: string | null;
        };
        Relationships: [];
      };
      v_metrics_summary: {
        Row: {
          description: string | null;
          direction: string | null;
          metric: string | null;
          value: number | null;
        };
        Relationships: [];
      };
      v_relation_candidates: {
        Row: {
          candidate_title: string | null;
          candidate_type: Database["public"]["Enums"]["digest_type"] | null;
          digest_title: string | null;
          digest_type: Database["public"]["Enums"]["digest_type"] | null;
          occurred_at: string | null;
          rank: number | null;
          score: number | null;
          verdict: string | null;
        };
        Relationships: [];
      };
      v_search_log: {
        Row: {
          lowest_score: number | null;
          occurred_at: string | null;
          query: string | null;
          result_count: number | null;
          top_score: number | null;
        };
        Insert: {
          lowest_score?: never;
          occurred_at?: string | null;
          query?: never;
          result_count?: never;
          top_score?: never;
        };
        Update: {
          lowest_score?: never;
          occurred_at?: string | null;
          query?: never;
          result_count?: never;
          top_score?: never;
        };
        Relationships: [];
      };
      v_search_results: {
        Row: {
          digest_title: string | null;
          digest_type: Database["public"]["Enums"]["digest_type"] | null;
          occurred_at: string | null;
          query: string | null;
          rank: number | null;
          score: number | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      content_language: "en" | "ko";
      digest_relation_type: "support" | "weaken";
      digest_type: "decision" | "pending" | "learning" | "idea" | "assumption";
      digestion_status: "pending" | "completed";
      mcp_tool:
        | "search_digests"
        | "get_source"
        | "get_relations"
        | "get_digest";
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
      content_language: ["en", "ko"],
      digest_relation_type: ["support", "weaken"],
      digest_type: ["decision", "pending", "learning", "idea", "assumption"],
      digestion_status: ["pending", "completed"],
      mcp_tool: ["search_digests", "get_source", "get_relations", "get_digest"],
    },
  },
} as const;
