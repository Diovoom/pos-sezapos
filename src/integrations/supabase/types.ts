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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admin_login_attempts: {
        Row: {
          attempted_at: string
          email: string
          id: string
          ip: string | null
          success: boolean
          user_agent: string | null
        }
        Insert: {
          attempted_at?: string
          email: string
          id?: string
          ip?: string | null
          success: boolean
          user_agent?: string | null
        }
        Update: {
          attempted_at?: string
          email?: string
          id?: string
          ip?: string | null
          success?: boolean
          user_agent?: string | null
        }
        Relationships: []
      }
      admin_permissions: {
        Row: {
          created_at: string
          permission: string
          role: string
        }
        Insert: {
          created_at?: string
          permission: string
          role: string
        }
        Update: {
          created_at?: string
          permission?: string
          role?: string
        }
        Relationships: []
      }
      admin_support_sessions: {
        Row: {
          admin_email: string | null
          admin_id: string
          channel_token: string
          client_capability: string | null
          client_metadata: Json | null
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          ended_at: string | null
          expires_at: string
          id: string
          reason: string
          requested_at: string
          started_at: string
          status: string
          store_id: string | null
        }
        Insert: {
          admin_email?: string | null
          admin_id: string
          channel_token?: string
          client_capability?: string | null
          client_metadata?: Json | null
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          ended_at?: string | null
          expires_at?: string
          id?: string
          reason: string
          requested_at?: string
          started_at?: string
          status?: string
          store_id?: string | null
        }
        Update: {
          admin_email?: string | null
          admin_id?: string
          channel_token?: string
          client_capability?: string | null
          client_metadata?: Json | null
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          ended_at?: string | null
          expires_at?: string
          id?: string
          reason?: string
          requested_at?: string
          started_at?: string
          status?: string
          store_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_support_sessions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      age_verifications: {
        Row: {
          cashier_email: string | null
          cashier_id: string | null
          created_at: string
          customer_dob: string | null
          id: string
          id_document_last4: string | null
          id_expires_on: string | null
          id_full_name_masked: string | null
          manager_override_id: string | null
          method: string
          min_age: number
          override_reason: string | null
          product_ids: string[]
          raw_meta: Json
          result: string
          sale_id: string | null
          store_id: string | null
        }
        Insert: {
          cashier_email?: string | null
          cashier_id?: string | null
          created_at?: string
          customer_dob?: string | null
          id?: string
          id_document_last4?: string | null
          id_expires_on?: string | null
          id_full_name_masked?: string | null
          manager_override_id?: string | null
          method: string
          min_age: number
          override_reason?: string | null
          product_ids?: string[]
          raw_meta?: Json
          result: string
          sale_id?: string | null
          store_id?: string | null
        }
        Update: {
          cashier_email?: string | null
          cashier_id?: string | null
          created_at?: string
          customer_dob?: string | null
          id?: string
          id_document_last4?: string | null
          id_expires_on?: string | null
          id_full_name_masked?: string | null
          manager_override_id?: string | null
          method?: string
          min_age?: number
          override_reason?: string | null
          product_ids?: string[]
          raw_meta?: Json
          result?: string
          sale_id?: string | null
          store_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "age_verifications_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "age_verifications_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      api_rate_limit_buckets: {
        Row: {
          blocked_until: string | null
          key_hash: string
          request_count: number
          scope: string
          updated_at: string
          window_started_at: string
        }
        Insert: {
          blocked_until?: string | null
          key_hash: string
          request_count?: number
          scope: string
          updated_at?: string
          window_started_at?: string
        }
        Update: {
          blocked_until?: string | null
          key_hash?: string
          request_count?: number
          scope?: string
          updated_at?: string
          window_started_at?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          created_at: string
          details: Json | null
          entity: string | null
          entity_id: string | null
          id: string
          ip: string | null
          store_id: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          details?: Json | null
          entity?: string | null
          entity_id?: string | null
          id?: string
          ip?: string | null
          store_id?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          details?: Json | null
          entity?: string | null
          entity_id?: string | null
          id?: string
          ip?: string | null
          store_id?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_movements: {
        Row: {
          amount: number
          created_at: string
          id: string
          idempotency_key: string | null
          notes: string | null
          reason: string
          register_session_id: string
          store_id: string
          type: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          idempotency_key?: string | null
          notes?: string | null
          reason: string
          register_session_id: string
          store_id: string
          type: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          idempotency_key?: string | null
          notes?: string | null
          reason?: string
          register_session_id?: string
          store_id?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_movements_register_session_id_fkey"
            columns: ["register_session_id"]
            isOneToOne: false
            referencedRelation: "register_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_movements_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          color: string | null
          created_at: string
          id: string
          name: string
          sort_order: number
          store_id: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          name: string
          sort_order?: number
          store_id?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
          store_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "categories_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      country_profiles: {
        Row: {
          address_format: Json
          age_defaults: Json
          business_reg_fields: Json
          country_code: string
          country_name: string
          created_at: string
          currency_code: string
          currency_symbol: string
          date_format: string
          decimal_precision: number
          decimal_sep: string
          default_language: string
          default_locale: string
          default_tax_rate: number
          paper_size: string
          phone_format: string | null
          postal_regex: string | null
          receipt_format: Json
          regions: Json
          rtl: boolean
          symbol_position: string
          tax_inclusive_default: boolean
          thousands_sep: string
          time_format: string
          updated_at: string
        }
        Insert: {
          address_format?: Json
          age_defaults?: Json
          business_reg_fields?: Json
          country_code: string
          country_name: string
          created_at?: string
          currency_code: string
          currency_symbol: string
          date_format?: string
          decimal_precision?: number
          decimal_sep?: string
          default_language?: string
          default_locale?: string
          default_tax_rate?: number
          paper_size?: string
          phone_format?: string | null
          postal_regex?: string | null
          receipt_format?: Json
          regions?: Json
          rtl?: boolean
          symbol_position?: string
          tax_inclusive_default?: boolean
          thousands_sep?: string
          time_format?: string
          updated_at?: string
        }
        Update: {
          address_format?: Json
          age_defaults?: Json
          business_reg_fields?: Json
          country_code?: string
          country_name?: string
          created_at?: string
          currency_code?: string
          currency_symbol?: string
          date_format?: string
          decimal_precision?: number
          decimal_sep?: string
          default_language?: string
          default_locale?: string
          default_tax_rate?: number
          paper_size?: string
          phone_format?: string | null
          postal_regex?: string | null
          receipt_format?: Json
          regions?: Json
          rtl?: boolean
          symbol_position?: string
          tax_inclusive_default?: boolean
          thousands_sep?: string
          time_format?: string
          updated_at?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          store_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          store_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      device_pairing_codes: {
        Row: {
          code_hash: string
          consumed_at: string | null
          consumed_device_id: string | null
          created_at: string
          created_by: string
          expires_at: string
          id: string
          label: string
          store_id: string
        }
        Insert: {
          code_hash: string
          consumed_at?: string | null
          consumed_device_id?: string | null
          created_at?: string
          created_by: string
          expires_at: string
          id?: string
          label: string
          store_id: string
        }
        Update: {
          code_hash?: string
          consumed_at?: string | null
          consumed_device_id?: string | null
          created_at?: string
          created_by?: string
          expires_at?: string
          id?: string
          label?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "device_pairing_codes_consumed_device_id_fkey"
            columns: ["consumed_device_id"]
            isOneToOne: false
            referencedRelation: "device_registrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_pairing_codes_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      device_registrations: {
        Row: {
          app_version: string | null
          created_at: string
          id: string
          label: string
          last_seen_at: string | null
          last_sync_at: string | null
          paired_at: string
          paired_by: string | null
          platform: string | null
          revoke_reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          secret_hash: string
          status: string
          status_snapshot: Json
          store_id: string
          updated_at: string
        }
        Insert: {
          app_version?: string | null
          created_at?: string
          id?: string
          label: string
          last_seen_at?: string | null
          last_sync_at?: string | null
          paired_at?: string
          paired_by?: string | null
          platform?: string | null
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          secret_hash: string
          status?: string
          status_snapshot?: Json
          store_id: string
          updated_at?: string
        }
        Update: {
          app_version?: string | null
          created_at?: string
          id?: string
          label?: string
          last_seen_at?: string | null
          last_sync_at?: string | null
          paired_at?: string
          paired_by?: string | null
          platform?: string | null
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          secret_hash?: string
          status?: string
          status_snapshot?: Json
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "device_registrations_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      legal_acceptances: {
        Row: {
          accepted_at: string
          id: string
          privacy_version: string
          recorded_at: string
          source: string
          store_id: string
          terms_version: string
          user_id: string
        }
        Insert: {
          accepted_at?: string
          id?: string
          privacy_version: string
          recorded_at?: string
          source?: string
          store_id: string
          terms_version: string
          user_id: string
        }
        Update: {
          accepted_at?: string
          id?: string
          privacy_version?: string
          recorded_at?: string
          source?: string
          store_id?: string
          terms_version?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "legal_acceptances_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_attempts: {
        Row: {
          amount: number
          attempted_by: string | null
          created_at: string
          currency: string
          id: string
          message: string | null
          method: string
          provider: string | null
          reference: string | null
          status: string
          store_id: string | null
        }
        Insert: {
          amount: number
          attempted_by?: string | null
          created_at?: string
          currency?: string
          id?: string
          message?: string | null
          method: string
          provider?: string | null
          reference?: string | null
          status: string
          store_id?: string | null
        }
        Update: {
          amount?: number
          attempted_by?: string | null
          created_at?: string
          currency?: string
          id?: string
          message?: string | null
          method?: string
          provider?: string | null
          reference?: string | null
          status?: string
          store_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_attempts_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_terminals: {
        Row: {
          config: Json
          created_at: string
          id: string
          label: string
          last_seen_at: string | null
          location: string | null
          provider: string
          serial: string | null
          status: string
          store_id: string
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          id?: string
          label: string
          last_seen_at?: string | null
          location?: string | null
          provider?: string
          serial?: string | null
          status?: string
          store_id: string
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          id?: string
          label?: string
          last_seen_at?: string | null
          location?: string | null
          provider?: string
          serial?: string | null
          status?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_terminals_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_settings: {
        Row: {
          billing_email: string
          company_name: string
          created_at: string
          default_trial_days: number
          id: string
          incident_email: string
          live_chat_enabled: boolean
          maintenance_message: string | null
          maintenance_mode: boolean
          merchant_banner: string | null
          support_email: string
          support_sla_minutes: number
          timezone: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          billing_email?: string
          company_name?: string
          created_at?: string
          default_trial_days?: number
          id?: string
          incident_email?: string
          live_chat_enabled?: boolean
          maintenance_message?: string | null
          maintenance_mode?: boolean
          merchant_banner?: string | null
          support_email?: string
          support_sla_minutes?: number
          timezone?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          billing_email?: string
          company_name?: string
          created_at?: string
          default_trial_days?: number
          id?: string
          incident_email?: string
          live_chat_enabled?: boolean
          maintenance_message?: string | null
          maintenance_mode?: boolean
          merchant_banner?: string | null
          support_email?: string
          support_sla_minutes?: number
          timezone?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      products: {
        Row: {
          age_category: string | null
          age_restricted: boolean
          barcode: string | null
          brand: string | null
          category_id: string | null
          cost: number
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          images: string[]
          is_favorite: boolean
          max_stock: number | null
          min_age: number | null
          min_stock: number
          name: string
          price: number
          sku: string | null
          status: string
          stock: number
          store_id: string | null
          supplier: string | null
          taxable: boolean
          track_inventory: boolean
          unit: string
          updated_at: string
        }
        Insert: {
          age_category?: string | null
          age_restricted?: boolean
          barcode?: string | null
          brand?: string | null
          category_id?: string | null
          cost?: number
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          images?: string[]
          is_favorite?: boolean
          max_stock?: number | null
          min_age?: number | null
          min_stock?: number
          name: string
          price?: number
          sku?: string | null
          status?: string
          stock?: number
          store_id?: string | null
          supplier?: string | null
          taxable?: boolean
          track_inventory?: boolean
          unit?: string
          updated_at?: string
        }
        Update: {
          age_category?: string | null
          age_restricted?: boolean
          barcode?: string | null
          brand?: string | null
          category_id?: string | null
          cost?: number
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          images?: string[]
          is_favorite?: boolean
          max_stock?: number | null
          min_age?: number | null
          min_stock?: number
          name?: string
          price?: number
          sku?: string | null
          status?: string
          stock?: number
          store_id?: string | null
          supplier?: string | null
          taxable?: boolean
          track_inventory?: boolean
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          employee_id: string | null
          first_name: string | null
          full_name: string | null
          hire_date: string | null
          hourly_wage: number | null
          id: string
          last_name: string | null
          late_threshold_minutes: number
          must_change_password: boolean
          must_change_pin: boolean
          phone: string | null
          photo_url: string | null
          pin_fingerprint: string | null
          pin_hash: string | null
          preferred_language: string | null
          preferred_locale: string | null
          scheduled_end_time: string | null
          scheduled_start_time: string | null
          status: string
          store_id: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          employee_id?: string | null
          first_name?: string | null
          full_name?: string | null
          hire_date?: string | null
          hourly_wage?: number | null
          id: string
          last_name?: string | null
          late_threshold_minutes?: number
          must_change_password?: boolean
          must_change_pin?: boolean
          phone?: string | null
          photo_url?: string | null
          pin_fingerprint?: string | null
          pin_hash?: string | null
          preferred_language?: string | null
          preferred_locale?: string | null
          scheduled_end_time?: string | null
          scheduled_start_time?: string | null
          status?: string
          store_id?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          employee_id?: string | null
          first_name?: string | null
          full_name?: string | null
          hire_date?: string | null
          hourly_wage?: number | null
          id?: string
          last_name?: string | null
          late_threshold_minutes?: number
          must_change_password?: boolean
          must_change_pin?: boolean
          phone?: string | null
          photo_url?: string | null
          pin_fingerprint?: string | null
          pin_hash?: string | null
          preferred_language?: string | null
          preferred_locale?: string | null
          scheduled_end_time?: string | null
          scheduled_start_time?: string | null
          status?: string
          store_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      refund_items: {
        Row: {
          created_at: string
          id: string
          line_total: number
          product_id: string | null
          product_name: string
          quantity: number
          refund_id: string
          restock: boolean
          sale_item_id: string | null
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          line_total?: number
          product_id?: string | null
          product_name: string
          quantity?: number
          refund_id: string
          restock?: boolean
          sale_item_id?: string | null
          unit_price?: number
        }
        Update: {
          created_at?: string
          id?: string
          line_total?: number
          product_id?: string | null
          product_name?: string
          quantity?: number
          refund_id?: string
          restock?: boolean
          sale_item_id?: string | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "refund_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refund_items_refund_id_fkey"
            columns: ["refund_id"]
            isOneToOne: false
            referencedRelation: "refunds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refund_items_sale_item_id_fkey"
            columns: ["sale_item_id"]
            isOneToOne: false
            referencedRelation: "sale_items"
            referencedColumns: ["id"]
          },
        ]
      }
      refunds: {
        Row: {
          approver_id: string | null
          cashier_id: string | null
          created_at: string
          id: string
          notes: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          reason: string
          refund_type: string
          sale_id: string
          status: string
          store_id: string | null
          subtotal: number
          tax: number
          total: number
        }
        Insert: {
          approver_id?: string | null
          cashier_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          reason?: string
          refund_type?: string
          sale_id: string
          status?: string
          store_id?: string | null
          subtotal?: number
          tax?: number
          total?: number
        }
        Update: {
          approver_id?: string | null
          cashier_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          reason?: string
          refund_type?: string
          sale_id?: string
          status?: string
          store_id?: string | null
          subtotal?: number
          tax?: number
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "refunds_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      register_sessions: {
        Row: {
          approver_id: string | null
          cash_refunds: number
          cash_sales: number
          close_notes: string | null
          closed_at: string | null
          closed_by: string | null
          closing_cash: number | null
          created_at: string
          denominations: Json | null
          expected_cash: number | null
          id: string
          notes: string | null
          opened_at: string
          opened_by: string
          opening_cash: number
          safe_drop_amount: number
          status: string
          store_id: string
          terminal_id: string | null
          updated_at: string
          variance: number | null
        }
        Insert: {
          approver_id?: string | null
          cash_refunds?: number
          cash_sales?: number
          close_notes?: string | null
          closed_at?: string | null
          closed_by?: string | null
          closing_cash?: number | null
          created_at?: string
          denominations?: Json | null
          expected_cash?: number | null
          id?: string
          notes?: string | null
          opened_at?: string
          opened_by: string
          opening_cash?: number
          safe_drop_amount?: number
          status?: string
          store_id: string
          terminal_id?: string | null
          updated_at?: string
          variance?: number | null
        }
        Update: {
          approver_id?: string | null
          cash_refunds?: number
          cash_sales?: number
          close_notes?: string | null
          closed_at?: string | null
          closed_by?: string | null
          closing_cash?: number | null
          created_at?: string
          denominations?: Json | null
          expected_cash?: number | null
          id?: string
          notes?: string | null
          opened_at?: string
          opened_by?: string
          opening_cash?: number
          safe_drop_amount?: number
          status?: string
          store_id?: string
          terminal_id?: string | null
          updated_at?: string
          variance?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "register_sessions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          created_at: string
          id: string
          permission: string
          role: Database["public"]["Enums"]["app_role"]
          store_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          permission: string
          role: Database["public"]["Enums"]["app_role"]
          store_id: string
        }
        Update: {
          created_at?: string
          id?: string
          permission?: string
          role?: Database["public"]["Enums"]["app_role"]
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_items: {
        Row: {
          created_at: string
          id: string
          line_total: number
          product_id: string | null
          product_name: string
          quantity: number
          sale_id: string
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          line_total?: number
          product_id?: string | null
          product_name: string
          quantity?: number
          sale_id: string
          unit_price?: number
        }
        Update: {
          created_at?: string
          id?: string
          line_total?: number
          product_id?: string | null
          product_name?: string
          quantity?: number
          sale_id?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "sale_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          metadata: Json
          method: string
          provider: string | null
          provider_reference: string | null
          sale_id: string
          status: string
          store_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          metadata?: Json
          method: string
          provider?: string | null
          provider_reference?: string | null
          sale_id: string
          status?: string
          store_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          metadata?: Json
          method?: string
          provider?: string | null
          provider_reference?: string | null
          sale_id?: string
          status?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sale_payments_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_payments_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          amount_tendered: number | null
          cashier_id: string | null
          change_due: number | null
          created_at: string
          customer_email: string | null
          customer_id: string | null
          customer_name: string | null
          customer_phone: string | null
          discount: number
          external_order_ref: string | null
          guest_count: number | null
          id: string
          idempotency_key: string | null
          kitchen_status: string
          notes: string | null
          offline_created_at: string | null
          order_type: string
          payment_method: Database["public"]["Enums"]["payment_method"]
          receipt_number: number | null
          refund_status: string
          refunded_amount: number
          register_session_id: string | null
          status: string
          store_id: string | null
          subtotal: number
          synced_from_offline: boolean
          table_label: string | null
          tax: number
          terminal_ref: string | null
          total: number
        }
        Insert: {
          amount_tendered?: number | null
          cashier_id?: string | null
          change_due?: number | null
          created_at?: string
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          discount?: number
          external_order_ref?: string | null
          guest_count?: number | null
          id?: string
          idempotency_key?: string | null
          kitchen_status?: string
          notes?: string | null
          offline_created_at?: string | null
          order_type?: string
          payment_method?: Database["public"]["Enums"]["payment_method"]
          receipt_number?: number | null
          refund_status?: string
          refunded_amount?: number
          register_session_id?: string | null
          status?: string
          store_id?: string | null
          subtotal?: number
          synced_from_offline?: boolean
          table_label?: string | null
          tax?: number
          terminal_ref?: string | null
          total?: number
        }
        Update: {
          amount_tendered?: number | null
          cashier_id?: string | null
          change_due?: number | null
          created_at?: string
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          discount?: number
          external_order_ref?: string | null
          guest_count?: number | null
          id?: string
          idempotency_key?: string | null
          kitchen_status?: string
          notes?: string | null
          offline_created_at?: string | null
          order_type?: string
          payment_method?: Database["public"]["Enums"]["payment_method"]
          receipt_number?: number | null
          refund_status?: string
          refunded_amount?: number
          register_session_id?: string | null
          status?: string
          store_id?: string | null
          subtotal?: number
          synced_from_offline?: boolean
          table_label?: string | null
          tax?: number
          terminal_ref?: string | null
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_register_session_id_fkey"
            columns: ["register_session_id"]
            isOneToOne: false
            referencedRelation: "register_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          idempotency_key: string | null
          message_body: string | null
          provider: string
          provider_message_id: string | null
          provider_response: Json | null
          recipient_phone: string
          sale_id: string | null
          sent_by: string | null
          status: string
          store_id: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          idempotency_key?: string | null
          message_body?: string | null
          provider: string
          provider_message_id?: string | null
          provider_response?: Json | null
          recipient_phone: string
          sale_id?: string | null
          sent_by?: string | null
          status?: string
          store_id: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          idempotency_key?: string | null
          message_body?: string | null
          provider?: string
          provider_message_id?: string | null
          provider_response?: Json | null
          recipient_phone?: string
          sale_id?: string | null
          sent_by?: string | null
          status?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sms_send_log_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sms_send_log_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_settings: {
        Row: {
          credentials: Json
          default_country: string
          enabled: boolean
          last_checked_at: string | null
          last_status: string | null
          provider: string
          sender_id: string | null
          store_id: string
          updated_at: string
        }
        Insert: {
          credentials?: Json
          default_country?: string
          enabled?: boolean
          last_checked_at?: string | null
          last_status?: string | null
          provider?: string
          sender_id?: string | null
          store_id: string
          updated_at?: string
        }
        Update: {
          credentials?: Json
          default_country?: string
          enabled?: boolean
          last_checked_at?: string | null
          last_status?: string | null
          provider?: string
          sender_id?: string | null
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sms_settings_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: true
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      stores: {
        Row: {
          address: string | null
          address_format_override: Json | null
          admin_notes: string | null
          age_verification_settings: Json
          allow_cashier_quick_add: boolean
          business_hours: Json | null
          business_type: string | null
          city: string | null
          country: string | null
          country_code: string | null
          created_at: string
          currency: string
          currency_symbol: string | null
          date_format: string | null
          email: string | null
          id: string
          language: string | null
          locale: string | null
          logo_url: string | null
          name: string
          paper_size: string | null
          phone: string | null
          phone_format_override: string | null
          plan_cancel_at_period_end: boolean | null
          plan_period_end: string | null
          plan_status: string
          plan_tier: string
          pos_display_name: string | null
          receipt_footer: string | null
          receipt_header: string | null
          receipt_logo_url: string | null
          region_code: string | null
          return_policy: string | null
          setup_completed_at: string | null
          setup_state: Json
          show_expected_before_count: boolean
          social_links: Json
          starting_cash_float: number
          state: string | null
          store_code: string | null
          suspended_at: string | null
          suspended_reason: string | null
          tax_id: string | null
          tax_inclusive: boolean
          tax_rate: number
          thank_you_message: string | null
          time_zone: string | null
          trial_ends_at: string | null
          updated_at: string
          variance_alert_threshold: number
          website: string | null
          zip: string | null
        }
        Insert: {
          address?: string | null
          address_format_override?: Json | null
          admin_notes?: string | null
          age_verification_settings?: Json
          allow_cashier_quick_add?: boolean
          business_hours?: Json | null
          business_type?: string | null
          city?: string | null
          country?: string | null
          country_code?: string | null
          created_at?: string
          currency?: string
          currency_symbol?: string | null
          date_format?: string | null
          email?: string | null
          id?: string
          language?: string | null
          locale?: string | null
          logo_url?: string | null
          name: string
          paper_size?: string | null
          phone?: string | null
          phone_format_override?: string | null
          plan_cancel_at_period_end?: boolean | null
          plan_period_end?: string | null
          plan_status?: string
          plan_tier?: string
          pos_display_name?: string | null
          receipt_footer?: string | null
          receipt_header?: string | null
          receipt_logo_url?: string | null
          region_code?: string | null
          return_policy?: string | null
          setup_completed_at?: string | null
          setup_state?: Json
          show_expected_before_count?: boolean
          social_links?: Json
          starting_cash_float?: number
          state?: string | null
          store_code?: string | null
          suspended_at?: string | null
          suspended_reason?: string | null
          tax_id?: string | null
          tax_inclusive?: boolean
          tax_rate?: number
          thank_you_message?: string | null
          time_zone?: string | null
          trial_ends_at?: string | null
          updated_at?: string
          variance_alert_threshold?: number
          website?: string | null
          zip?: string | null
        }
        Update: {
          address?: string | null
          address_format_override?: Json | null
          admin_notes?: string | null
          age_verification_settings?: Json
          allow_cashier_quick_add?: boolean
          business_hours?: Json | null
          business_type?: string | null
          city?: string | null
          country?: string | null
          country_code?: string | null
          created_at?: string
          currency?: string
          currency_symbol?: string | null
          date_format?: string | null
          email?: string | null
          id?: string
          language?: string | null
          locale?: string | null
          logo_url?: string | null
          name?: string
          paper_size?: string | null
          phone?: string | null
          phone_format_override?: string | null
          plan_cancel_at_period_end?: boolean | null
          plan_period_end?: string | null
          plan_status?: string
          plan_tier?: string
          pos_display_name?: string | null
          receipt_footer?: string | null
          receipt_header?: string | null
          receipt_logo_url?: string | null
          region_code?: string | null
          return_policy?: string | null
          setup_completed_at?: string | null
          setup_state?: Json
          show_expected_before_count?: boolean
          social_links?: Json
          starting_cash_float?: number
          state?: string | null
          store_code?: string | null
          suspended_at?: string | null
          suspended_reason?: string | null
          tax_id?: string | null
          tax_inclusive?: boolean
          tax_rate?: number
          thank_you_message?: string | null
          time_zone?: string | null
          trial_ends_at?: string | null
          updated_at?: string
          variance_alert_threshold?: number
          website?: string | null
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stores_country_code_fkey"
            columns: ["country_code"]
            isOneToOne: false
            referencedRelation: "country_profiles"
            referencedColumns: ["country_code"]
          },
        ]
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean | null
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          environment: string
          id: string
          price_id: string
          product_id: string
          status: string
          store_id: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          environment?: string
          id?: string
          price_id: string
          product_id: string
          status?: string
          store_id?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          environment?: string
          id?: string
          price_id?: string
          product_id?: string
          status?: string
          store_id?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      support_ticket_notes: {
        Row: {
          author_email: string | null
          author_id: string | null
          body: string
          created_at: string
          id: string
          internal: boolean
          ticket_id: string
        }
        Insert: {
          author_email?: string | null
          author_id?: string | null
          body: string
          created_at?: string
          id?: string
          internal?: boolean
          ticket_id: string
        }
        Update: {
          author_email?: string | null
          author_id?: string | null
          body?: string
          created_at?: string
          id?: string
          internal?: boolean
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_ticket_notes_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          assigned_admin_id: string | null
          category: string
          chat_ended_at: string | null
          chat_ended_by: string | null
          chat_status: string
          claimed_at: string | null
          closed_at: string | null
          created_at: string
          first_response_at: string | null
          id: string
          last_admin_read_at: string | null
          last_merchant_read_at: string | null
          last_message_at: string | null
          priority: string
          requester_email: string | null
          requester_id: string | null
          resolution: string | null
          resolution_code: string | null
          resolution_summary: string | null
          resolved_at: string | null
          status: string
          store_id: string | null
          subject: string
          ticket_number: number
          updated_at: string
        }
        Insert: {
          assigned_admin_id?: string | null
          category?: string
          chat_ended_at?: string | null
          chat_ended_by?: string | null
          chat_status?: string
          claimed_at?: string | null
          closed_at?: string | null
          created_at?: string
          first_response_at?: string | null
          id?: string
          last_admin_read_at?: string | null
          last_merchant_read_at?: string | null
          last_message_at?: string | null
          priority?: string
          requester_email?: string | null
          requester_id?: string | null
          resolution?: string | null
          resolution_code?: string | null
          resolution_summary?: string | null
          resolved_at?: string | null
          status?: string
          store_id?: string | null
          subject: string
          ticket_number?: number
          updated_at?: string
        }
        Update: {
          assigned_admin_id?: string | null
          category?: string
          chat_ended_at?: string | null
          chat_ended_by?: string | null
          chat_status?: string
          claimed_at?: string | null
          closed_at?: string | null
          created_at?: string
          first_response_at?: string | null
          id?: string
          last_admin_read_at?: string | null
          last_merchant_read_at?: string | null
          last_message_at?: string | null
          priority?: string
          requester_email?: string | null
          requester_id?: string | null
          resolution?: string | null
          resolution_code?: string | null
          resolution_summary?: string | null
          resolved_at?: string | null
          status?: string
          store_id?: string | null
          subject?: string
          ticket_number?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      time_entries: {
        Row: {
          approved_by: string | null
          break_minutes: number
          break_start: string | null
          clock_in: string
          clock_out: string | null
          created_at: string
          id: string
          late: boolean
          late_minutes: number
          notes: string | null
          override_reason: string | null
          store_id: string | null
          user_id: string
        }
        Insert: {
          approved_by?: string | null
          break_minutes?: number
          break_start?: string | null
          clock_in?: string
          clock_out?: string | null
          created_at?: string
          id?: string
          late?: boolean
          late_minutes?: number
          notes?: string | null
          override_reason?: string | null
          store_id?: string | null
          user_id: string
        }
        Update: {
          approved_by?: string | null
          break_minutes?: number
          break_start?: string | null
          clock_in?: string
          clock_out?: string | null
          created_at?: string
          id?: string
          late?: boolean
          late_minutes?: number
          notes?: string | null
          override_reason?: string | null
          store_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_entries_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          store_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          store_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          store_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_global_search: {
        Args: { _limit?: number; _q: string }
        Returns: {
          id: string
          kind: string
          label: string
          store_id: string
          sublabel: string
        }[]
      }
      can_manage_employee: {
        Args: { _actor: string; _target: string }
        Returns: boolean
      }
      cleanup_api_rate_limit_buckets: { Args: never; Returns: number }
      consume_api_rate_limit: {
        Args: {
          p_block_seconds?: number
          p_key_hash: string
          p_limit: number
          p_scope: string
          p_window_seconds: number
        }
        Returns: {
          allowed: boolean
          remaining: number
          retry_after_seconds: number
        }[]
      }
      current_store_id: { Args: never; Returns: string }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      email_for_employee_id: {
        Args: { p_employee_id: string }
        Returns: string
      }
      email_queue_dispatch: { Args: never; Returns: undefined }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      finalize_pos_sale: {
        Args: { p_items: Json; p_payments?: Json; p_sale: Json }
        Returns: Json
      }
      generate_employee_id: { Args: never; Returns: string }
      generate_store_code: { Args: never; Returns: string }
      has_active_plan: {
        Args: { _min_tier?: string; _store_id: string }
        Returns: boolean
      }
      has_admin_permission: {
        Args: { _permission: string; _user_id: string }
        Returns: boolean
      }
      has_any_role: {
        Args: {
          _roles: Database["public"]["Enums"]["app_role"][]
          _user_id: string
        }
        Returns: boolean
      }
      has_permission: {
        Args: { _permission: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_last_owner: { Args: { _user_id: string }; Returns: boolean }
      is_platform_staff: { Args: { _user_id: string }; Returns: boolean }
      is_read_only: { Args: { _store_id: string }; Returns: boolean }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      merchant_update_support_ticket: {
        Args: {
          _priority?: string
          _status?: string
          _subject?: string
          _ticket_id: string
        }
        Returns: {
          assigned_admin_id: string | null
          category: string
          chat_ended_at: string | null
          chat_ended_by: string | null
          chat_status: string
          claimed_at: string | null
          closed_at: string | null
          created_at: string
          first_response_at: string | null
          id: string
          last_admin_read_at: string | null
          last_merchant_read_at: string | null
          last_message_at: string | null
          priority: string
          requester_email: string | null
          requester_id: string | null
          resolution: string | null
          resolution_code: string | null
          resolution_summary: string | null
          resolved_at: string | null
          status: string
          store_id: string | null
          subject: string
          ticket_number: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "support_tickets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      plan_tier_for_price: { Args: { _price_id: string }; Returns: string }
      pos_find_pin_candidates: {
        Args: { _fingerprint: string; _store_id: string }
        Returns: {
          email: string
          id: string
          pin_hash: string
        }[]
      }
      pos_list_unfingerprinted: {
        Args: { _store_id: string }
        Returns: {
          email: string
          id: string
          pin_hash: string
        }[]
      }
      pos_pin_conflict_check: {
        Args: { _exclude_user: string; _fingerprint: string; _store_id: string }
        Returns: boolean
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      recompute_store_plan: { Args: { _store_id: string }; Returns: undefined }
      record_legal_acceptance: {
        Args: {
          p_accepted_at?: string
          p_privacy_version: string
          p_source?: string
          p_terms_version: string
        }
        Returns: string
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      simulate_trial_expiry: { Args: { _store_id: string }; Returns: undefined }
      tier_rank: { Args: { _tier: string }; Returns: number }
    }
    Enums: {
      app_role:
        | "owner"
        | "manager"
        | "cashier"
        | "admin"
        | "super_admin"
        | "operations_admin"
        | "support_admin"
        | "billing_admin"
        | "analyst"
      payment_method:
        | "cash"
        | "card"
        | "tap"
        | "apple_pay"
        | "google_pay"
        | "gift_card"
        | "split"
        | "store_credit"
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
  public: {
    Enums: {
      app_role: [
        "owner",
        "manager",
        "cashier",
        "admin",
        "super_admin",
        "operations_admin",
        "support_admin",
        "billing_admin",
        "analyst",
      ],
      payment_method: [
        "cash",
        "card",
        "tap",
        "apple_pay",
        "google_pay",
        "gift_card",
        "split",
        "store_credit",
      ],
    },
  },
} as const
