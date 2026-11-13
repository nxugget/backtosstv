export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.17";
  };
  public: {
    Tables: {
      admins: {
        Row: {
          avatar_url: string | null;
          display_name: string | null;
          is_owner: boolean;
          shown_on_credits: boolean;
          user_id: string;
        };
        Insert: {
          avatar_url?: string | null;
          display_name?: string | null;
          is_owner?: boolean;
          shown_on_credits?: boolean;
          user_id: string;
        };
        Update: {
          avatar_url?: string | null;
          display_name?: string | null;
          is_owner?: boolean;
          shown_on_credits?: boolean;
          user_id?: string;
        };
        Relationships: [];
      };
      api_request_counters: {
        Row: {
          client: string;
          requests: number;
          window_started_at: string;
        };
        Insert: {
          client: string;
          requests: number;
          window_started_at: string;
        };
        Update: {
          client?: string;
          requests?: number;
          window_started_at?: string;
        };
        Relationships: [];
      };
      app_users: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          logo_url: string | null;
          name: string;
          updated_at: string;
          updated_by: string | null;
          url: string | null;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          logo_url?: string | null;
          name: string;
          updated_at?: string;
          updated_by?: string | null;
          url?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          logo_url?: string | null;
          name?: string;
          updated_at?: string;
          updated_by?: string | null;
          url?: string | null;
        };
        Relationships: [];
      };
      deleted_events: {
        Row: {
          deleted_at: string;
          id: string;
        };
        Insert: {
          deleted_at?: string;
          id: string;
        };
        Update: {
          deleted_at?: string;
          id?: string;
        };
        Relationships: [];
      };
      operators: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          logo_url: string | null;
          name: string;
          slug: string;
          updated_at: string;
          updated_by: string | null;
          url: string | null;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          logo_url?: string | null;
          name: string;
          slug: string;
          updated_at?: string;
          updated_by?: string | null;
          url?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          logo_url?: string | null;
          name?: string;
          slug?: string;
          updated_at?: string;
          updated_by?: string | null;
          url?: string | null;
        };
        Relationships: [];
      };
      satellites: {
        Row: {
          alternate_name: string | null;
          created_at: string;
          created_by: string | null;
          default_operator_id: string | null;
          name: string;
          norad_id: number;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          alternate_name?: string | null;
          created_at?: string;
          created_by?: string | null;
          default_operator_id?: string | null;
          name: string;
          norad_id: number;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          alternate_name?: string | null;
          created_at?: string;
          created_by?: string | null;
          default_operator_id?: string | null;
          name?: string;
          norad_id?: number;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "satellites_default_operator_id_fkey";
            columns: ["default_operator_id"];
            isOneToOne: false;
            referencedRelation: "operators";
            referencedColumns: ["id"];
          },
        ];
      };
      sstv_events: {
        Row: {
          cancelled_at: string | null;
          created_at: string;
          created_by: string | null;
          title: string | null;
          end_time: string;
          frequency: number;
          id: string;
          image_interval_seconds: number | null;
          image_url: string | null;
          mode: Database["public"]["Enums"]["sstv_mode"];
          norad_id: number;
          operator_id: string | null;
          source_url: string | null;
          start_time: string;
          transmit_power_watts: number | null;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          cancelled_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          title?: string | null;
          end_time: string;
          frequency: number;
          id?: string;
          image_interval_seconds?: number | null;
          image_url?: string | null;
          mode: Database["public"]["Enums"]["sstv_mode"];
          norad_id: number;
          operator_id?: string | null;
          source_url?: string | null;
          start_time: string;
          transmit_power_watts?: number | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          cancelled_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          title?: string | null;
          end_time?: string;
          frequency?: number;
          id?: string;
          image_interval_seconds?: number | null;
          image_url?: string | null;
          mode?: Database["public"]["Enums"]["sstv_mode"];
          norad_id?: number;
          operator_id?: string | null;
          source_url?: string | null;
          start_time?: string;
          transmit_power_watts?: number | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "sstv_events_operator_id_fkey";
            columns: ["operator_id"];
            isOneToOne: false;
            referencedRelation: "operators";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sstv_events_norad_id_fkey";
            columns: ["norad_id"];
            isOneToOne: false;
            referencedRelation: "satellites";
            referencedColumns: ["norad_id"];
          },
        ];
      };
    };
    Views: {
      public_credit_apps: {
        Row: {
          id: string | null;
          logo_url: string | null;
          name: string | null;
          url: string | null;
        };
        Insert: {
          id?: string | null;
          logo_url?: string | null;
          name?: string | null;
          url?: string | null;
        };
        Update: {
          id?: string | null;
          logo_url?: string | null;
          name?: string | null;
          url?: string | null;
        };
        Relationships: [];
      };
      public_credit_feeders: {
        Row: {
          avatar_url: string | null;
          display_name: string | null;
        };
        Insert: {
          avatar_url?: string | null;
          display_name?: string | null;
        };
        Update: {
          avatar_url?: string | null;
          display_name?: string | null;
        };
        Relationships: [];
      };
      public_deletions: {
        Row: {
          deleted_at: string | null;
          id: string | null;
          resource: string | null;
        };
        Insert: {
          deleted_at?: string | null;
          id?: string | null;
          resource?: never;
        };
        Update: {
          deleted_at?: string | null;
          id?: string | null;
          resource?: never;
        };
        Relationships: [];
      };
      public_events: {
        Row: {
          cancelled_at: string | null;
          created_at: string | null;
          title: string | null;
          end_time: string | null;
          frequency: number | null;
          id: string | null;
          image_interval_seconds: number | null;
          image_url: string | null;
          mode: Database["public"]["Enums"]["sstv_mode"] | null;
          operator_logo_url: string | null;
          operator_name: string | null;
          operator_slug: string | null;
          operator_url: string | null;
          satellite_alternate_name: string | null;
          satellite_name: string | null;
          satellite_norad_id: number | null;
          source_url: string | null;
          start_time: string | null;
          transmit_power_watts: number | null;
          updated_at: string | null;
        };
        Relationships: [];
      };
      public_operators: {
        Row: {
          created_at: string | null;
          logo_url: string | null;
          name: string | null;
          slug: string | null;
          updated_at: string | null;
          url: string | null;
        };
        Insert: {
          created_at?: string | null;
          logo_url?: string | null;
          name?: string | null;
          slug?: string | null;
          updated_at?: string | null;
          url?: string | null;
        };
        Update: {
          created_at?: string | null;
          logo_url?: string | null;
          name?: string | null;
          slug?: string | null;
          updated_at?: string | null;
          url?: string | null;
        };
        Relationships: [];
      };
      public_satellites: {
        Row: {
          alternate_name: string | null;
          created_at: string | null;
          name: string | null;
          norad_id: number | null;
          updated_at: string | null;
        };
        Insert: {
          alternate_name?: string | null;
          created_at?: string | null;
          name?: string | null;
          norad_id?: number | null;
          updated_at?: string | null;
        };
        Update: {
          alternate_name?: string | null;
          created_at?: string | null;
          name?: string | null;
          norad_id?: number | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      count_api_request: {
        Args: { p_client: string; p_window_seconds: number };
        Returns: number;
      };
      is_admin: {
        Args: never;
        Returns: boolean;
      };
      latest_event_for_satellite: {
        Args: never;
        Returns: {
          frequency: number;
          image_interval_seconds: number | null;
          mode: Database["public"]["Enums"]["sstv_mode"];
          norad_id: number;
        }[];
      };
      record_event_deletion: {
        Args: never;
        Returns: unknown;
      };
    };
    Enums: {
      sstv_mode:
        | "Robot 36"
        | "Robot 72"
        | "Martin 1"
        | "Martin 2"
        | "Scottie 1"
        | "Scottie 2"
        | "Scottie DX"
        | "PD50"
        | "PD90"
        | "PD120"
        | "PD160"
        | "PD180"
        | "PD240";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      sstv_mode: [
        "Robot 36",
        "Robot 72",
        "Martin 1",
        "Martin 2",
        "Scottie 1",
        "Scottie 2",
        "Scottie DX",
        "PD50",
        "PD90",
        "PD120",
        "PD160",
        "PD180",
        "PD240",
      ],
    },
  },
} as const;
