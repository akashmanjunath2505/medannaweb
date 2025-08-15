/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { createClient, Session, User, AuthError } from '@supabase/supabase-js';
import { TrainingPhase } from './geminiService';

// Define the Json type locally, as it's no longer exported from supabase-js
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];


// --- DATABASE SCHEMA (DEFINED FIRST FOR TYPE RESOLUTION) ---

// Define the enum type separately to avoid potential circular dependencies in the Database type.
export type NotificationTypeEnum = "achievement" | "reminder" | "new_feature" | "system_message";

// To fix TypeScript errors like "Type instantiation is excessively deep", the schema must be
// structured correctly for the Supabase client's type inference. We define enums within the
// `Database` type itself and reference them from the table definitions.
export type Database = {
  public: {
    Tables: {
      notifications: {
        Row: {
          created_at: string
          id: number
          is_read: boolean
          link: string | null
          message: string
          title: string
          type: NotificationTypeEnum
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: number
          is_read?: boolean
          link?: string | null
          message: string
          title: string
          type: NotificationTypeEnum
          user_id: string
        }
        Update: {
          created_at?: string
          id?: number
          is_read?: boolean
          link?: string | null
          message?: string
          title?: string
          type?: NotificationTypeEnum
          user_id?: string
        }
      }
      profiles: {
        Row: {
          email: string
          full_name: string | null
          id: string
        }
        Insert: {
          email: string
          full_name?: string | null
          id: string
        }
        Update: {
          email?: string
          full_name?: string | null
          id?: string
        }
      }
    }
    Views: {}
    Functions: {}
    Enums: {
      notification_type: NotificationTypeEnum
    }
    CompositeTypes: {}
  }
}


// --- SUPABASE CLIENT INITIALIZATION ---
const supabaseUrl = 'https://uianlejvqqjkyjetmieg.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVpYW5sZWp2cXFqa3lqZXRtaWVnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQyMjQ0NjcsImV4cCI6MjA2OTgwMDQ2N30.er1YtxPovCJFDp0qyjBbuNCo9wyjCS5tokNnne6k8h8';

if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase URL and Anon Key not found. Please ensure SUPABASE_URL and SUPABASE_ANON_KEY environment variables are set.");
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);

// --- TYPE DEFINITIONS ---
// type TrainingPhase is imported from geminiService
// Derive types from the Database schema for type safety.
export type Profile = Database['public']['Tables']['profiles']['Row'] & {
  training_phase: TrainingPhase | null;
};
export type Notification = Database['public']['Tables']['notifications']['Row'];
// This type is derived from the enum inside the Database schema for a single source of truth.
export type NotificationType = NotificationTypeEnum;


// --- AUTHENTICATION FUNCTIONS ---
export const signUp = async ({ email, password, fullName }: { email: string, password: string, fullName: string }) => {
    const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
            data: {
                full_name: fullName,
            },
        },
    });
    if (error) throw error;
    return data;
};

export const signIn = async ({ email, password }: { email: string, password: string }) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
};

export const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
};

// --- USER DATA FUNCTIONS ---
export const getUserProfile = async (userId: string): Promise<Database['public']['Tables']['profiles']['Row'] | null> => {
    const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .eq('id', userId)
        .single();
    if (error) {
        console.error('Error fetching profile:', error.message);
        return null;
    }
    return data;
};

export const updateUserProfile = async (userId: string, updates: Database['public']['Tables']['profiles']['Update']): Promise<Profile | null> => {
    const { data, error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', userId)
        .select('id, full_name, email')
        .single();

    if (error) {
        console.error('Error updating profile:', error.message);
        throw error;
    };
    if (!data) return null;


    // We need to return a full profile, so we get the training_phase from auth metadata
    const { data: { session } } = await supabase.auth.getSession();
    const training_phase = session?.user?.user_metadata?.training_phase ?? null;
    
    return { ...data, training_phase: training_phase as TrainingPhase | null };
};

// --- NOTIFICATION FUNCTIONS ---
export const getNotifications = async (userId: string): Promise<Notification[]> => {
    const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50); // Limit to last 50 notifications for performance
    if (error) {
        console.error('Error fetching notifications:', error.message);
        return [];
    }
    return data || [];
};

export const markNotificationAsRead = async (notificationId: number, userId: string): Promise<boolean> => {
    const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', notificationId)
        .eq('user_id', userId); // Ensure user can only update their own
    if (error) {
        console.error('Error marking notification as read:', error.message);
        return false;
    }
    return true;
};

export const markAllNotificationsAsRead = async (userId: string): Promise<boolean> => {
    const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', userId)
        .eq('is_read', false);
    if (error) {
        console.error('Error marking all notifications as read:', error.message);
        return false;
    }
    return true;
};
