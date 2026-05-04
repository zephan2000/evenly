export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.5';
  };
  public: {
    Tables: {
      expense_items: {
        Row: {
          amount: number;
          expense_id: string;
          id: string;
          name: string;
          quantity: number;
          sort_order: number;
          unit_amount: number;
        };
        Insert: {
          amount: number;
          expense_id: string;
          id?: string;
          name: string;
          quantity?: number;
          sort_order?: number;
          unit_amount: number;
        };
        Update: {
          amount?: number;
          expense_id?: string;
          id?: string;
          name?: string;
          quantity?: number;
          sort_order?: number;
          unit_amount?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'expense_items_expense_id_fkey';
            columns: ['expense_id'];
            isOneToOne: false;
            referencedRelation: 'expenses';
            referencedColumns: ['id'];
          },
        ];
      };
      expenses: {
        Row: {
          category: string;
          created_at: string;
          created_by_member_id: string;
          deleted_at: string | null;
          expense_date: string;
          fx_rate: number | null;
          fx_rate_status: string | null;
          home_amount: number | null;
          id: string;
          merchant: string | null;
          notes: string | null;
          original_amount: number;
          original_currency: string;
          payer_member_id: string;
          receipt_image_path: string | null;
          service_charge: number;
          subtotal: number;
          tax_amount: number;
          tax_label: string | null;
          tax_mode: string;
          tip: number;
          trip_id: string;
          updated_at: string;
        };
        Insert: {
          category: string;
          created_at?: string;
          created_by_member_id: string;
          deleted_at?: string | null;
          expense_date?: string;
          fx_rate?: number | null;
          fx_rate_status?: string | null;
          home_amount?: number | null;
          id?: string;
          merchant?: string | null;
          notes?: string | null;
          original_amount: number;
          original_currency: string;
          payer_member_id: string;
          receipt_image_path?: string | null;
          service_charge?: number;
          subtotal?: number;
          tax_amount?: number;
          tax_label?: string | null;
          tax_mode: string;
          tip?: number;
          trip_id: string;
          updated_at?: string;
        };
        Update: {
          category?: string;
          created_at?: string;
          created_by_member_id?: string;
          deleted_at?: string | null;
          expense_date?: string;
          fx_rate?: number | null;
          fx_rate_status?: string | null;
          home_amount?: number | null;
          id?: string;
          merchant?: string | null;
          notes?: string | null;
          original_amount?: number;
          original_currency?: string;
          payer_member_id?: string;
          receipt_image_path?: string | null;
          service_charge?: number;
          subtotal?: number;
          tax_amount?: number;
          tax_label?: string | null;
          tax_mode?: string;
          tip?: number;
          trip_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'expenses_created_by_member_id_fkey';
            columns: ['created_by_member_id'];
            isOneToOne: false;
            referencedRelation: 'trip_members';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'expenses_payer_member_id_fkey';
            columns: ['payer_member_id'];
            isOneToOne: false;
            referencedRelation: 'trip_members';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'expenses_trip_id_fkey';
            columns: ['trip_id'];
            isOneToOne: false;
            referencedRelation: 'trips';
            referencedColumns: ['id'];
          },
        ];
      };
      trip_members: {
        Row: {
          anon_id: string | null;
          claimed_at: string | null;
          device_locale: string | null;
          display_name: string;
          fingerprint_hash: string | null;
          geo_city: string | null;
          id: string;
          joined_at: string;
          timezone: string | null;
          trip_id: string;
          user_agent: string | null;
          user_id: string | null;
        };
        Insert: {
          anon_id?: string | null;
          claimed_at?: string | null;
          device_locale?: string | null;
          display_name: string;
          fingerprint_hash?: string | null;
          geo_city?: string | null;
          id?: string;
          joined_at?: string;
          timezone?: string | null;
          trip_id: string;
          user_agent?: string | null;
          user_id?: string | null;
        };
        Update: {
          anon_id?: string | null;
          claimed_at?: string | null;
          device_locale?: string | null;
          display_name?: string;
          fingerprint_hash?: string | null;
          geo_city?: string | null;
          id?: string;
          joined_at?: string;
          timezone?: string | null;
          trip_id?: string;
          user_agent?: string | null;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'trip_members_trip_id_fkey';
            columns: ['trip_id'];
            isOneToOne: false;
            referencedRelation: 'trips';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'trip_members_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      trips: {
        Row: {
          auth_mode: string;
          created_at: string;
          deleted_at: string | null;
          home_currency: string;
          id: string;
          name: string;
          owner_user_id: string;
          share_token: string;
          share_token_rotated_at: string | null;
        };
        Insert: {
          auth_mode?: string;
          created_at?: string;
          deleted_at?: string | null;
          home_currency: string;
          id?: string;
          name: string;
          owner_user_id: string;
          share_token?: string;
          share_token_rotated_at?: string | null;
        };
        Update: {
          auth_mode?: string;
          created_at?: string;
          deleted_at?: string | null;
          home_currency?: string;
          id?: string;
          name?: string;
          owner_user_id?: string;
          share_token?: string;
          share_token_rotated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'trips_owner_user_id_fkey';
            columns: ['owner_user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      users: {
        Row: {
          clerk_user_id: string;
          created_at: string;
          display_name: string | null;
          email: string | null;
          id: string;
        };
        Insert: {
          clerk_user_id: string;
          created_at?: string;
          display_name?: string | null;
          email?: string | null;
          id?: string;
        };
        Update: {
          clerk_user_id?: string;
          created_at?: string;
          display_name?: string | null;
          email?: string | null;
          id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      current_user_id: { Args: never; Returns: string };
      save_expense_with_items: {
        Args: {
          p_category: string;
          p_created_by_member_id: string;
          p_expense_date: string;
          p_items: Json;
          p_merchant: string;
          p_notes: string;
          p_original_amount: number;
          p_original_currency: string;
          p_payer_member_id: string;
          p_receipt_image_path: string;
          p_service_charge: number;
          p_subtotal: number;
          p_tax_amount: number;
          p_tax_label: string;
          p_tax_mode: string;
          p_tip: number;
          p_trip_id: string;
        };
        Returns: string;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema['Enums']
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
