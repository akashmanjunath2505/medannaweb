/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { createClient, Session, User, AuthError } from '@supabase/supabase-js';
import { TrainingPhase, Specialty, CognitiveSkill, EPA } from './geminiService';

// --- DATABASE SCHEMA (DEFINED FIRST FOR TYPE RESOLUTION) ---

// Define Json type to prevent recursion with complex objects.
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// Define the specific shape of the case_details JSON object for type safety.
// This resolves issues with recursive type definitions that can cause compiler errors.
export interface CaseResultDetails {
  diagnosisCorrect: boolean;
  mcqCorrectCount: number;
  mcqTotal: number;
  epaScores: { history: number; physicalExam: number; };
  hintPenalty: number;
  finalScore: number;
  scoreBreakdown: {
    diagnosis: number;
    knowledge: number;
    historyTaking: number;
    physicalExam: number;
  };
  tags: {
    trainingPhase: TrainingPhase;
    specialty: Specialty;
    cognitiveSkill: CognitiveSkill;
    epas: EPA[];
    curriculum: {
        framework: 'CBME/NExT';
        competency: string;
    };
  };
}


// To fix TypeScript errors related to "Type instantiation is excessively deep and possibly infinite",
// we must avoid circular type references. The original `Database` type had its tables refer back to
// the `Database` type itself to get an enum definition, creating a loop.
//
// The fix is to define the enum type *outside* of the `Database` type. This breaks the recursion,
// allowing TypeScript's type inference to work correctly for Supabase client methods like `update` and `insert`.
export type NotificationTypeEnum = "achievement" | "reminder" | "new_feature" | "system_message" | "leaderboard";


export type Database = {
  public: {
    Tables: {
      case_logs: {
        Row: {
          case_details: Json | null
          case_title: string
          created_at: string
          id: number
          score: number
          user_id: string
        }
        Insert: {
          case_details: Json | null
          case_title: string
          created_at?: string
          id?: number
          score: number
          user_id: string
        }
        Update: {
          case_details?: Json | null
          case_title?: string
          created_at?: string
          id?: number
          score?: number
          user_id?: string
        }
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
      }
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
      }
    }
    Views: {}
    Functions: {}
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
export type Streak = Database['public']['Tables']['streaks']['Row'];
export type CaseLog = Database['public']['Tables']['case_logs']['Row'];
export type Notification = Database['public']['Tables']['notifications']['Row'];
// This type is derived from the enum inside the Database schema for a single source of truth.
export type NotificationType = NotificationTypeEnum;

export type LeaderboardEntry = {
  user_id: string;
  score: number;
  accuracy: number;
  streak: number;
  profiles: {
    full_name: string | null;
  } | null;
};


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

export const getUserScore = async (userId: string): Promise<number> => {
    const { data, error } = await supabase
        .from('leaderboard')
        .select('score')
        .eq('user_id', userId)
        .single();

    if (error && error.code !== 'PGRST116') {
        console.error('Error fetching score:', error.message);
        return 0;
    }

    return data?.score ?? 0;
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

// --- CASE & PROGRESS FUNCTIONS ---
export const getCaseLogs = async (userId: string): Promise<CaseLog[]> => {
    const { data, error } = await supabase
        .from('case_logs')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
    if (error) {
        console.error('Error fetching case logs:', error.message);
        return [];
    }
    return data || [];
};

export const getStreak = async(userId: string): Promise<Streak | null> => {
    const { data, error } = await supabase
        .from('streaks')
        .select('*')
        .eq('user_id', userId)
        .single();
    
    if (error && error.code !== 'PGRST116') { // PGRST116: no rows found
        console.error('Error fetching streak:', error.message);
    }
    return data;
}

export const logCaseCompletion = async (
  userId: string,
  caseResult: { case_title: string; case_details: CaseResultDetails; score: number }
): Promise<void> => {
    try {
        const todayUTC = new Date();
        todayUTC.setUTCHours(0, 0, 0, 0);
        const todayStr = todayUTC.toISOString().split('T')[0];
        
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
        
        const streakData = streakResult.data;
        const progressData = progressResult.data;
        const leaderboardData = leaderboardResult.data;
        
        // --- 2. PREPARE all updates ---
        
        // Prepare Case Log data
        const caseLogInsert: Database['public']['Tables']['case_logs']['Insert'] = {
            user_id: userId,
            case_title: caseResult.case_title,
            case_details: caseResult.case_details as Json,
            score: caseResult.score,
        };

        const casesCompletedBeforeThis = progressData?.completed || 0;
        const progressUpsert: Database['public']['Tables']['progress']['Insert'] = {
            user_id: userId,
            completed: casesCompletedBeforeThis + 1,
            updated_at: new Date().toISOString(),
        };
        
        // Prepare Streak update data with robust, timezone-safe logic
        let newCurrentStreak = 1;
        let newMaxStreak = streakData?.max_streak || 0;

        if (streakData?.last_active_day) {
            const lastActiveDayStr = streakData.last_active_day;

            if (lastActiveDayStr === todayStr) {
                // User already completed a case today, streak doesn't change.
                newCurrentStreak = streakData.current_streak;
            } else {
                // Check if the last active day was yesterday.
                const yesterdayUTC = new Date(todayUTC);
                yesterdayUTC.setUTCDate(todayUTC.getUTCDate() - 1);
                const yesterdayStr = yesterdayUTC.toISOString().split('T')[0];

                if (lastActiveDayStr === yesterdayStr) {
                    // It was yesterday, so increment the streak.
                    newCurrentStreak = (streakData.current_streak || 0) + 1;
                }
                // If it was not yesterday (and not today), the streak is broken.
                // newCurrentStreak is already 1 by default, which is correct for a reset.
            }
        }
        
        // Update max streak if the new current streak is greater.
        if (newCurrentStreak > newMaxStreak) {
            newMaxStreak = newCurrentStreak;
        }
        
        const streakUpsert: Database['public']['Tables']['streaks']['Insert'] = {
            user_id: userId,
            current_streak: newCurrentStreak,
            max_streak: newMaxStreak,
            last_active_day: todayStr
        };

        // Prepare Leaderboard update data - NEW LOGIC
        // The score in the leaderboard is now an AVERAGE score.
        // Formula: new_avg = (old_avg * old_count + new_score) / (old_count + 1)
        const currentAverageScore = leaderboardData?.score || 0;
        const newAverageScore = 
            (currentAverageScore * casesCompletedBeforeThis + caseResult.score) / (casesCompletedBeforeThis + 1);

        const leaderboardUpsert: Database['public']['Tables']['leaderboard']['Insert'] = {
            user_id: userId,
            score: newAverageScore
        };


        // Prepare notification
        const notificationInsert: Database['public']['Tables']['notifications']['Insert'] = {
            user_id: userId,
            title: `Case Completed!`,
            message: `You scored ${caseResult.score.toFixed(1)}/10 on "${caseResult.case_title}".`,
            type: 'achievement',
            link: '#progress'
        };

        // --- 3. EXECUTE all writes ---
        const writes = await Promise.all([
            supabase.from('case_logs').insert(caseLogInsert),
            supabase.from('progress').upsert(progressUpsert),
            supabase.from('streaks').upsert(streakUpsert),
            supabase.from('leaderboard').upsert(leaderboardUpsert),
            supabase.from('notifications').insert(notificationInsert),
        ]);

        // Check for errors in any of the write operations
        for (const result of writes) {
            if (result.error) {
                // Don't throw for upsert "ignore" scenarios if that's ever used. For now, any error is critical.
                throw new Error(`A database operation failed: ${result.error.message}`);
            }
        }

    } catch (error) {
        console.error("Critical error in logCaseCompletion:", error instanceof Error ? error.message : error);
        // Re-throw the error so the calling context knows something went wrong
        throw error;
    }
};


// --- LEADERBOARD ---
const botUsers: LeaderboardEntry[] = [
    { user_id: 'bot_1', score: 9.8, accuracy: 99, streak: 150, profiles: { full_name: 'Dr. Axiom' } },
    { user_id: 'bot_2', score: 9.5, accuracy: 98, streak: 120, profiles: { full_name: 'Doc Synth' } },
    { user_id: 'bot_3', score: 9.2, accuracy: 95, streak: 210, profiles: { full_name: 'Prognosis Pete' } },
    { user_id: 'bot_4', score: 8.9, accuracy: 92, streak: 95, profiles: { full_name: 'Data-driven Dana' } },
    { user_id: 'bot_5', score: 8.5, accuracy: 90, streak: 180, profiles: { full_name: 'Medibot 3000' } },
    { user_id: 'bot_6', score: 8.2, accuracy: 88, streak: 88, profiles: { full_name: 'Holistic Hal' } },
    { user_id: 'bot_7', score: 7.9, accuracy: 85, streak: 75, profiles: { full_name: 'Clinical AI' } },
    { user_id: 'bot_8', score: 7.5, accuracy: 84, streak: 60, profiles: { full_name: 'Virtual Vivian' } },
    { user_id: 'bot_9', score: 7.2, accuracy: 82, streak: 50, profiles: { full_name: 'Synapse Sam' } },
    { user_id: 'bot_10', score: 6.8, accuracy: 80, streak: 45, profiles: { full_name: 'Algorithmic Alex' } },
];

export const getLeaderboard = async (): Promise<LeaderboardEntry[]> => {
    // 1. Fetch top 20 users by score
    const { data: leaderboardData, error: leaderboardError } = await supabase
        .from('leaderboard')
        .select('user_id, score')
        .order('score', { ascending: false })
        .limit(20);

    if (leaderboardError) {
        console.error('Error fetching leaderboard:', leaderboardError.message);
        return botUsers.sort((a, b) => b.score - a.score);
    }

    if (leaderboardData.length === 0) {
        return botUsers.sort((a, b) => b.score - a.score);
    }

    const userIds = leaderboardData.map(u => u.user_id);

    // 2. Fetch profiles, streaks, and case logs for these users concurrently
    const [profilesResult, streaksResult, caseLogsResult] = await Promise.all([
        supabase.from('profiles').select('id, full_name').in('id', userIds),
        supabase.from('streaks').select('user_id, current_streak').in('user_id', userIds),
        supabase.from('case_logs').select('user_id, case_details').in('user_id', userIds)
    ]);
    
    if (profilesResult.error) console.error('Error fetching profiles for leaderboard:', profilesResult.error.message);
    if (streaksResult.error) console.error('Error fetching streaks for leaderboard:', streaksResult.error.message);
    if (caseLogsResult.error) console.error('Error fetching case logs for leaderboard:', caseLogsResult.error.message);

    const profilesMap = new Map(profilesResult.data?.map(p => [p.id, p.full_name || 'Anonymous']));
    const streaksMap = new Map(streaksResult.data?.map(s => [s.user_id, s.current_streak || 0]));
    
    // 3. Calculate accuracy for each user
    const accuracyMap = new Map<string, number>();
    const userCaseStats: Record<string, { correct: number, total: number }> = {};

    (caseLogsResult.data || []).forEach(log => {
        if (!userCaseStats[log.user_id]) {
            userCaseStats[log.user_id] = { correct: 0, total: 0 };
        }
        userCaseStats[log.user_id].total++;
        if ((log.case_details as CaseResultDetails | null)?.diagnosisCorrect) {
            userCaseStats[log.user_id].correct++;
        }
    });

    Object.keys(userCaseStats).forEach(userId => {
        const { correct, total } = userCaseStats[userId];
        accuracyMap.set(userId, total > 0 ? Math.round((correct / total) * 100) : 0);
    });

    // 4. Combine all data
    const realUsersWithDetails: LeaderboardEntry[] = leaderboardData.map(user => ({
        user_id: user.user_id,
        score: user.score,
        profiles: { full_name: profilesMap.get(user.user_id) || 'Anonymous' },
        streak: streaksMap.get(user.user_id) || 0,
        accuracy: accuracyMap.get(user.user_id) || 0,
    }));

    // 5. Merge with bots, sort, and return top results
    const realUserIds = new Set(realUsersWithDetails.map(u => u.user_id));
    const filteredBots = botUsers.filter(b => !realUserIds.has(b.user_id));
    const combinedList = [...realUsersWithDetails, ...filteredBots];

    return combinedList.sort((a, b) => b.score - a.score).slice(0, 20);
};