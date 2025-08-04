/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { createClient, Session, User, AuthError } from '@supabase/supabase-js';

// --- TYPE DEFINITIONS ---
type TrainingPhase = 'Pre-clinical' | 'Para-clinical' | 'Clinical' | 'Internship' | 'NExT/FMGE Prep';

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  training_phase: TrainingPhase | null;
}

// The profile data as it is stored in the 'profiles' table.
type DbProfile = Omit<Profile, 'training_phase'>;

export interface Streak {
    user_id: string;
    current_streak: number;
    max_streak: number;
    last_active_day: string;
}

export interface CaseLog {
    id: number;
    user_id: string;
    case_title: string;
    case_details: string; // JSON string of case result
    created_at: string;
}

// --- DATABASE SCHEMA ---
export type Database = {
  public: {
    Tables: {
      case_logs: {
        Row: {
          case_details: string
          case_title: string
          created_at: string
          id: number
          user_id: string
        }
        Insert: {
          case_details: string
          case_title: string
          created_at?: string
          id?: number
          user_id: string
        }
        Update: {
          case_details?: string
          case_title?: string
          created_at?: string
          id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_logs_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      leaderboard: {
        Row: {
          score: number
          user_id: string
        }
        Insert: {
          score?: number
          user_id: string
        }
        Update: {
          score?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "leaderboard_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
            isOneToOne: true
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "profiles_id_fkey"
            columns: ["id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
            isOneToOne: true
          },
        ]
      }
      progress: {
        Row: {
          completed: number
          id: number
          updated_at: string
          user_id: string
        }
        Insert: {
          completed?: number
          id?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          completed?: number
          id?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "progress_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
            isOneToOne: true
          },
        ]
      }
      streaks: {
        Row: {
          current_streak: number
          last_active_day: string
          max_streak: number
          user_id: string
        }
        Insert: {
          current_streak?: number
          last_active_day: string
          max_streak?: number
          user_id: string
        }
        Update: {
          current_streak?: number
          last_active_day?: string
          max_streak?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "streaks_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
            isOneToOne: true
          },
        ]
      }
    }
    Views: {
      [key: string]: never
    }
    Functions: {
      [key: string]: never
    }
    Enums: {
      [key: string]: never
    }
    CompositeTypes: {
      [key: string]: never
    }
  }
}


// --- SUPABASE CLIENT INITIALIZATION ---
const supabaseUrl = 'https://uianlejvqqjkyjetmieg.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVpYW5sZWp2cXFqa3lqZXRtaWVnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQyMjQ0NjcsImV4cCI6MjA2OTgwMDQ2N30.er1YtxPovCJFDp0qyjBbuNCo9wyjCS5tokNnne6k8h8';

if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase URL and Anon Key not found. Please ensure SUPABASE_URL and SUPABASE_ANON_KEY environment variables are set.");
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);


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

export const updateUserProfile = async (userId: string, updates: Database['public']['Tables']['profiles']['Update']): Promise<Profile> => {
    const { data, error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', userId)
        .select('id, full_name, email')
        .single();

    if (error) throw error;
    if (!data) throw new Error("Profile not found after update.");


    // We need to return a full profile, so we get the training_phase from auth metadata
    const { data: { session } } = await supabase.auth.getSession();
    const training_phase = session?.user?.user_metadata?.training_phase ?? null;
    
    return { ...data, training_phase: training_phase as TrainingPhase | null };
};

export const getUserScore = async (userId: string): Promise<number | null> => {
    const { data, error } = await supabase
        .from('leaderboard')
        .select('score')
        .eq('user_id', userId)
        .single();

    if (error && error.code !== 'PGRST116') {
        console.error('Error fetching score:', error);
        return 0;
    }

    return data?.score ?? 0;
};

// --- CASE & PROGRESS FUNCTIONS ---
export const getCaseLogs = async (userId: string): Promise<CaseLog[]> => {
    const { data, error } = await supabase
        .from('case_logs')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
    if (error) {
        console.error('Error fetching case logs:', error);
        return [];
    }
    return data || [];
};

export const getStreak = async(userId: string): Promise<Database['public']['Tables']['streaks']['Row'] | null> => {
    const { data, error } = await supabase
        .from('streaks')
        .select('*')
        .eq('user_id', userId)
        .single();
    
    if (error && error.code !== 'PGRST116') { // PGRST116: no rows found
        console.error('Error fetching streak:', error);
    }
    return data;
}

export const logCaseCompletion = async (
  userId: string,
  caseResult: { case_title: string; case_details: string; score: number }
): Promise<void> => {
    try {
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];
        
        // --- 1. READ all necessary data concurrently ---
        const [
            streakResult,
            progressResult,
            leaderboardResult,
        ] = await Promise.all([
            supabase.from('streaks').select('*').eq('user_id', userId).maybeSingle(),
            supabase.from('progress').select('*').eq('user_id', userId).maybeSingle(),
            supabase.from('leaderboard').select('score').eq('user_id', userId).maybeSingle()
        ]);

        if (streakResult.error) throw streakResult.error;
        if (progressResult.error) throw progressResult.error;
        if (leaderboardResult.error) throw leaderboardResult.error;
        
        // --- 2. PREPARE all updates ---
        
        // Prepare Case Log data
        const caseLogInsert: Database['public']['Tables']['case_logs']['Insert'] = {
            user_id: userId,
            case_title: caseResult.case_title,
            case_details: caseResult.case_details,
        };

        // Prepare Progress update data
        const currentProgress = progressResult.data?.completed || 0;
        const progressUpsert: Database['public']['Tables']['progress']['Insert'] = {
            user_id: userId,
            completed: currentProgress + 1,
        };
        
        // Prepare Streak update data
        const streak = streakResult.data;
        let newCurrentStreak = 1;
        let newMaxStreak = streak?.max_streak || 0;

        if (streak && streak.last_active_day) {
            const lastActive = new Date(streak.last_active_day);
            const yesterday = new Date(today);
            yesterday.setDate(today.getDate() - 1);
            
            if (streak.last_active_day === todayStr) {
                newCurrentStreak = streak.current_streak; // Already active today, no change
            } else if (lastActive.toDateString() === yesterday.toDateString()) {
                newCurrentStreak = streak.current_streak + 1; // Active yesterday, increment
            }
            // Otherwise, streak is broken, it's reset to 1 (the default)
        }
        if (newCurrentStreak > newMaxStreak) {
            newMaxStreak = newCurrentStreak;
        }
        
        const streakUpsert: Database['public']['Tables']['streaks']['Insert'] = {
            user_id: userId,
            current_streak: newCurrentStreak,
            max_streak: newMaxStreak,
            last_active_day: todayStr
        };

        // Prepare Leaderboard update data
        const currentScore = leaderboardResult.data?.score || 0;
        const leaderboardUpsert: Database['public']['Tables']['leaderboard']['Insert'] = {
            user_id: userId,
            score: currentScore + caseResult.score
        };

        // --- 3. EXECUTE all writes ---
        const writes = await Promise.all([
            supabase.from('case_logs').insert(caseLogInsert),
            supabase.from('progress').upsert(progressUpsert),
            supabase.from('streaks').upsert(streakUpsert),
            supabase.from('leaderboard').upsert(leaderboardUpsert),
        ]);

        // Check for errors in any of the write operations
        for (const result of writes) {
            if (result.error) {
                throw new Error(`A database operation failed: ${result.error.message}`);
            }
        }

    } catch (error) {
        console.error("Critical error in logCaseCompletion:", error);
        // Re-throw the error so the calling context knows something went wrong
        throw error;
    }
};


// --- LEADERBOARD ---
const botUsers = [
    { user_id: 'bot_1', score: 1450, profiles: { full_name: 'Dr. Axiom' } },
    { user_id: 'bot_2', score: 1280, profiles: { full_name: 'Doc Synth' } },
    { user_id: 'bot_3', score: 1120, profiles: { full_name: 'Prognosis Pete' } },
    { user_id: 'bot_4', score: 980, profiles: { full_name: 'Data-driven Dana' } },
    { user_id: 'bot_5', score: 850, profiles: { full_name: 'Medibot 3000' } },
    { user_id: 'bot_6', score: 720, profiles: { full_name: 'Holistic Hal' } },
    { user_id: 'bot_7', score: 610, profiles: { full_name: 'Clinical AI' } },
    { user_id: 'bot_8', score: 530, profiles: { full_name: 'Virtual Vivian' } },
    { user_id: 'bot_9', score: 450, profiles: { full_name: 'Synapse Sam' } },
    { user_id: 'bot_10', score: 380, profiles: { full_name: 'Algorithmic Alex' } },
];

export const getLeaderboard = async (): Promise<any[]> => {
    const { data: realUsers, error } = await supabase
        .from('leaderboard')
        .select(`
            user_id,
            score,
            profiles (
                full_name
            )
        `)
        .order('score', { ascending: false })
        .limit(20);
    
    if (error) {
        console.error('Error fetching leaderboard:', error);
        return botUsers; // Return bots if fetching fails
    }
    
    const users = realUsers || [];

    // Filter out any real users that might be duplicated by bots
    const realUserIds = new Set(users.map(u => u.user_id));
    const filteredBots = botUsers.filter(b => !realUserIds.has(b.user_id));

    const combined = [...users, ...filteredBots];

    // Sort by score descending and take the top 20
    return combined.sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 20);
}
