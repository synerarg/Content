export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      brand_fonts: {
        Row: {
          brand_id: string
          created_at: string
          family: string
          id: string
          source: Database["public"]["Enums"]["font_source"]
          storage_path: string
          style: string
          weight: number
          workspace_id: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          family: string
          id?: string
          source: Database["public"]["Enums"]["font_source"]
          storage_path: string
          style?: string
          weight?: number
          workspace_id: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          family?: string
          id?: string
          source?: Database["public"]["Enums"]["font_source"]
          storage_path?: string
          style?: string
          weight?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_fonts_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_fonts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      brands: {
        Row: {
          art_direction: Json
          created_at: string
          example_captions: string[]
          id: string
          logo_path: string | null
          name: string
          palette: Json
          tagline: string | null
          target_audience: string | null
          tone_of_voice: string | null
          typography: Json
          updated_at: string
          workspace_id: string
        }
        Insert: {
          art_direction?: Json
          created_at?: string
          example_captions?: string[]
          id?: string
          logo_path?: string | null
          name: string
          palette?: Json
          tagline?: string | null
          target_audience?: string | null
          tone_of_voice?: string | null
          typography?: Json
          updated_at?: string
          workspace_id: string
        }
        Update: {
          art_direction?: Json
          created_at?: string
          example_captions?: string[]
          id?: string
          logo_path?: string | null
          name?: string
          palette?: Json
          tagline?: string | null
          target_audience?: string | null
          tone_of_voice?: string | null
          typography?: Json
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brands_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      content_batches: {
        Row: {
          brand_id: string
          brief: string
          created_at: string
          id: string
          status: Database["public"]["Enums"]["batch_status"]
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          brand_id: string
          brief?: string
          created_at?: string
          id?: string
          status?: Database["public"]["Enums"]["batch_status"]
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          brand_id?: string
          brief?: string
          created_at?: string
          id?: string
          status?: Database["public"]["Enums"]["batch_status"]
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_batches_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_batches_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      generations: {
        Row: {
          brand_id: string | null
          cache_read_tokens: number | null
          cache_write_tokens: number | null
          cost_estimate_usd: number | null
          created_at: string
          duration_ms: number | null
          error: string | null
          id: string
          input: Json
          input_tokens: number | null
          kind: Database["public"]["Enums"]["generation_kind"]
          model: string
          ok: boolean
          output: Json
          output_tokens: number | null
          provider: string
          workspace_id: string
        }
        Insert: {
          brand_id?: string | null
          cache_read_tokens?: number | null
          cache_write_tokens?: number | null
          cost_estimate_usd?: number | null
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          id?: string
          input?: Json
          input_tokens?: number | null
          kind: Database["public"]["Enums"]["generation_kind"]
          model: string
          ok?: boolean
          output?: Json
          output_tokens?: number | null
          provider: string
          workspace_id: string
        }
        Update: {
          brand_id?: string | null
          cache_read_tokens?: number | null
          cache_write_tokens?: number | null
          cost_estimate_usd?: number | null
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          id?: string
          input?: Json
          input_tokens?: number | null
          kind?: Database["public"]["Enums"]["generation_kind"]
          model?: string
          ok?: boolean
          output?: Json
          output_tokens?: number | null
          provider?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "generations_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          batch_id: string
          caption: string
          created_at: string
          cta: string
          hashtags: string[]
          id: string
          position: number
          type: Database["public"]["Enums"]["post_type"]
          updated_at: string
          workspace_id: string
        }
        Insert: {
          batch_id: string
          caption?: string
          created_at?: string
          cta?: string
          hashtags?: string[]
          id?: string
          position?: number
          type: Database["public"]["Enums"]["post_type"]
          updated_at?: string
          workspace_id: string
        }
        Update: {
          batch_id?: string
          caption?: string
          created_at?: string
          cta?: string
          hashtags?: string[]
          id?: string
          position?: number
          type?: Database["public"]["Enums"]["post_type"]
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "posts_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "content_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      slides: {
        Row: {
          background_path: string | null
          created_at: string
          format: string
          generation_params: Json
          id: string
          position: number
          post_id: string
          slots: Json
          template_slug: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          background_path?: string | null
          created_at?: string
          format?: string
          generation_params?: Json
          id?: string
          position?: number
          post_id: string
          slots?: Json
          template_slug: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          background_path?: string | null
          created_at?: string
          format?: string
          generation_params?: Json
          id?: string
          position?: number
          post_id?: string
          slots?: Json
          template_slug?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "slides_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "slides_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          created_at: string
          role: Database["public"]["Enums"]["workspace_role"]
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          role?: Database["public"]["Enums"]["workspace_role"]
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          role?: Database["public"]["Enums"]["workspace_role"]
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      generation_usage_daily: {
        Row: {
          avg_duration_ms: number | null
          brand_id: string | null
          cache_read_tokens: number | null
          cache_write_tokens: number | null
          calls: number | null
          cost_usd: number | null
          day: string | null
          failed_calls: number | null
          input_tokens: number | null
          kind: Database["public"]["Enums"]["generation_kind"] | null
          last_call_at: string | null
          ok_calls: number | null
          output_tokens: number | null
          priced_calls: number | null
          workspace_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "generations_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      current_workspace_ids: { Args: never; Returns: string[] }
      current_workspace_ids_text: { Args: never; Returns: string[] }
    }
    Enums: {
      batch_status: "draft" | "generating" | "ready" | "failed"
      font_source: "google" | "upload"
      generation_kind: "text" | "image"
      post_type: "feed" | "story" | "carousel"
      workspace_role: "owner" | "member"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      batch_status: ["draft", "generating", "ready", "failed"],
      font_source: ["google", "upload"],
      generation_kind: ["text", "image"],
      post_type: ["feed", "story", "carousel"],
      workspace_role: ["owner", "member"],
    },
  },
} as const
