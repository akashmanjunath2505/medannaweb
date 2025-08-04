/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useState, useEffect, useCallback, useRef, StrictMode, ReactNode, createContext, useContext, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { generateCase, createChatForCase, DiagnosticCase, MCQ, generateSoapNoteForCase, generateHint, CaseTags, GenerationFilters, Chat, pickSpecialtyForCase } from './services/geminiService';
import { supabase, signIn, signUp, signOut, getUserProfile, updateUserProfile, getCaseLogs, logCaseCompletion, getLeaderboard, getStreak, Profile, Streak, CaseLog, getUserScore } from './services/supabaseService';
import { Session, User } from '@supabase/supabase-js';


// --- TYPE DEFINITIONS ---
type Specialty = 'Internal Medicine' | 'Pediatrics' | 'Surgery' | 'Obstetrics & Gynecology' | 'Psychiatry' | 'Cardiology' | 'Neurology' | 'Dermatology' | 'Emergency Medicine';
type TrainingPhase = 'Pre-clinical' | 'Para-clinical' | 'Clinical' | 'Internship' | 'NExT/FMGE Prep';
type CognitiveSkill = 'Recall' | 'Application' | 'Analysis';
type EPA = 'History-taking' | 'Physical Exam' | 'Diagnosis' | 'Management';
type Page = 'home' | 'simulation';
type Theme = 'light' | 'dark';
type ActiveTab = 'chat' | 'diagnosis' | 'questions';
type HomeTab = 'new-case' | 'activity' | 'leaderboard';


interface ChatMessage {
    sender: 'user' | 'patient';
    text: string;
    timestamp: string;
}

interface CaseResultPayload {
    case_title: string;
    case_details: string;
    score: number;
}

interface ParsedVideo {
    file: string;
    state: 'idle' | 'talking';
    gender: 'Male' | 'Female';
    min_age: number;
    max_age: number;
}


// --- CONSTANTS & SEED DATA ---
const ALL_SPECIALTIES: Specialty[] = ['Internal Medicine', 'Pediatrics', 'Surgery', 'Obstetrics & Gynecology', 'Psychiatry', 'Cardiology', 'Neurology', 'Dermatology', 'Emergency Medicine'];
const ALL_TRAINING_PHASES: TrainingPhase[] = ['Pre-clinical', 'Para-clinical', 'Clinical', 'Internship', 'NExT/FMGE Prep'];
const ALL_EPAS: EPA[] = ['History-taking', 'Physical Exam', 'Diagnosis', 'Management'];
const MAX_HINTS = 10;
const HINT_STORAGE_KEY = 'medanna_hintUsage_v2';

const VIDEO_FILENAMES: string[] = [
    'adolescent_boy_idle_(age-15-22) (540p).mp4',
    'adolescent_boy_talking_(age-15-22) (540p).mp4',
    'adolescent_girl_idle(age_15-22) (540p).mp4',
    'adolescent_girl_idle.mp4',
    'adolescent_girl_talking(age_15-22) (540p).mp4',
    'adolescent_girl_talking.mp4',
    'boy_idle(age__7-15) (540p).mp4',
    'boy_talking(age__7-15) (540p).mp4',
    'girl_idle(age__7-15) (540p).mp4',
    'girl_talking(age__7-15) (540p).mp4',
    'lady_idle(age_23-30) (720p).mp4',
    'lady_idle(age__30-45) (540p).mp4',
    'lady_talking(age_23-30) (540p).mp4',
    'lady_talking(age_30-45) (540p)(1).mp4',
    'lady_talking(age_30-45) (540p).mp4',
    'man_idle(age_23-30) (540p).mp4',
    'man_idle(age_30-45) (540p).mp4',
    'man_talking(age_23-30) (540p).mp4',
    'man_talking(age_30-45) (540p).mp4',
    'old_man_idle(age_45-60) (540p)(1).mp4',
    'old_man_idle(age_45-60) (540p).mp4',
    'old_man_idle(age_60+) (540p).mp4',
    'old_man_talking(age_45-60) (540p).mp4',
    'old_man_talking(age_60+) (540p).mp4',
    'old_woman_idle(age_60+) (540p).mp4',
    'old_woman_talking(age_60+) (540p).mp4',
];


const MEDICAL_FUN_FACTS: Record<Specialty | 'General', string[]> = {
    'General': [
        'The human brain weighs about 3 pounds but uses 20% of the body\'s oxygen and calories.',
        'Your heart beats about 100,000 times a day.',
        'The acid in your stomach is strong enough to dissolve razor blades.',
        'Humans shed about 600,000 particles of skin every hour.',
        'The small intestine is about 22-23 feet long.',
        'The word "doctor" comes from the Latin word for "to teach".',
    ],
    'Internal Medicine': [
        'Internists are often called "doctors\' doctors" because they are frequently consulted by other physicians to help solve complex diagnostic problems.',
        'The stethoscope was invented in 1816 by René Laennec because he was uncomfortable placing his ear directly on a woman\'s chest.',
        'Type 2 diabetes accounts for about 90% of all cases of diabetes.',
    ],
    'Pediatrics': [
        'A newborn baby has about 300 bones, but an adult has only 206. Many bones fuse together as a child grows.',
        'The term "pediatrics" is derived from the Greek words "pais" (child) and "iatros" (doctor or healer).',
        'Babies are born without kneecaps. They develop them between the ages of 2 and 6.',
    ],
    'Surgery': [
        'The first successful open-heart surgery was performed by Dr. Daniel Hale Williams in 1893.',
        'The concept of "asepsis" (keeping the surgical environment free from microorganisms) was pioneered by Joseph Lister in the 1860s.',
        'Surgical robots, like the da Vinci system, allow surgeons to perform complex procedures with greater precision and smaller incisions.',
    ],
    'Obstetrics & Gynecology': [
        'The Apgar score, used to quickly assess a newborn\'s health, was devised by anesthesiologist Virginia Apgar in 1952.',
        'The term "cesarean section" is believed to be named after Julius Caesar, who was reputedly born by this method.',
        'A human baby is born every seven seconds on average worldwide.',
    ],
    'Psychiatry': [
        'The term "psychiatry" was first coined by the German physician Johann Christian Reil in 1808.',
        'Sigmund Freud, the founder of psychoanalysis, was originally a neurologist.',
        'Serotonin, a key neurotransmitter in mood regulation, is mostly produced in the gut, not the brain.',
    ],
    'Cardiology': [
        'Willem Einthoven invented the first practical electrocardiogram (ECG/EKG) in 1903 and won the Nobel Prize for it.',
        'The heart has its own electrical system that allows it to beat independently of the brain.',
        'A blue whale\'s heart is the largest in the world, weighing about 400 pounds.',
    ],
    'Neurology': [
        'The brain itself cannot feel pain because it lacks pain receptors.',
        'There are more nerve cells in the human brain than there are stars in the Milky Way galaxy.',
        'A single neuron can transmit 1,000 nerve impulses per second.',
    ],
    'Dermatology': [
        'The skin is the body\'s largest organ, weighing about 8 pounds and covering about 22 square feet.',
        'Your skin renews itself completely every 28 days.',
        'Goosebumps are a vestigial reflex from our ancestors who had more body hair. The contracting muscles would trap air for insulation.',
    ],
    'Emergency Medicine': [
        'The concept of the "golden hour" in trauma care suggests that a patient\'s chances of survival are greatest if they receive definitive care within one hour of injury.',
        'The first dedicated ambulance service was started by Dominique Jean Larrey, Napoleon Bonaparte\'s chief surgeon.',
        'Triage, the process of sorting patients based on the urgency of their need for care, originated from the Napoleonic Wars.',
    ]
};

// --- SVG ICONS ---
const IconBook = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>;
const IconMicroscope = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 18h8"/><path d="m3 22 7-7"/><path d="M14 2 12 4 4 12l2 2 8-8 2-2Z"/><path d="M9 13.5 6 16.5"/><path d="m14 6-2-2"/><path d="M18 12.5 15.5 10"/><path d="m20 14-2.5-2.5"/><path d="m22 16-2.5-2.5"/></svg>;
const IconStethoscope = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4a2 2 0 1 0 4 0a2 2 0 1 0-4 0"/><path d="M8 4h1a2 2 0 0 1 2 2v2a4 4 0 0 1-4 4H5a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2h-1"/><path d="M17 4a2 2 0 1 0 4 0a2 2 0 1 0-4 0"/></svg>;
const IconGraduationCap = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"/><path d="M22 10v6"/><path d="M6 12.5V16a6 6 0 0 0 12 0v-3.5"/></svg>;
const IconBriefcase = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="14" x="2" y="7" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>;
const IconMessage = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>;
const IconVolume = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/></svg>;
const IconVolumeOff = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5 6 9H2v6h4l5 5V5z"/><path d="m23 9-6 6M17 9l6 6"/></svg>;
const IconClose = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>;
const IconAlertTriangle = ({ className }: { className?: string }) => <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>;
const IconCheck = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>;
const IconX = ({className}: {className?: string}) => <svg className={className} xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>;
const IconChevronDown = ({ className }: { className?: string }) => <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>;
const IconHome = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>;
const IconRefresh = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/></svg>;
const IconSun = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>;
const IconMoon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>;
const IconSend = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>;
const IconPatient = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z"/><path d="M19 22v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/></svg>;
const IconLightbulb = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>;
const IconUser = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
const IconDashboard = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>;
const IconLogOut = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>;
const IconFlame = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5-2 4.5-2 4.5s-1.5-2-2.5-2c-1.5 0-2.5 2-2.5 2.5 0 2.5 2.5 2.5 2.5 2.5z"/><path d="M14.5 14.5c0-2.5-2.5-2.5-2.5-2.5s-2 0-2.5 2.5c.5.5 1.5 1.5 2.5 1.5s2-1 2.5-1.5z"/><path d="M12 18.5c-2.835 0-5.335-1.833-6-4.5 1.5 1 3 1.5 4.5 1.5s3-.5 4.5-1.5c-.667 2.667-3.165 4.5-6 4.5z"/></svg>;
const IconCheckCircle = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>;
const IconTrophy = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>;
const IconFileText = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>;


// --- REACT CONTEXT ---
interface AppContextType {
    // Auth & Profile
    session: Session | null;
    profile: Profile | null;
    isAuthLoading: boolean;
    authError: string | null;
    streak: Streak | null;
    score: number | null;
    caseLogs: CaseLog[];
    leaderboard: any[];
    setProfile: (profile: Profile | null) => void;
    handleSignOut: () => void;
    updateUserTrainingPhase: (trainingPhase: TrainingPhase) => Promise<void>;
    logCompletedCase: (caseResult: CaseResultPayload) => Promise<void>;

    // App State
    page: Page;
    setPage: (page: Page) => void;
    theme: Theme;
    toggleTheme: () => void;
    isMobile: boolean;
    
    // Case Generation
    isGenerating: boolean;
    generationError: string | null;
    generationFilters: GenerationFilters | null;
    currentCase: DiagnosticCase | null;
    handleStartNewCase: (caseData: DiagnosticCase) => void;
    handleGenerateAndStart: (filters: GenerationFilters) => Promise<void>;
    handleRegenerateCase: () => Promise<void>;
    
    // SOAP Note
    soapNote: string | null;
    isGeneratingSoapNote: boolean;
    soapNoteError: string | null;
    handleGenerateSoapNote: () => Promise<void>;
    
    // Hint
    hint: string | null;
    hintCount: number;
    isGeneratingHint: boolean;
    hintError: string | null;
    handleGenerateHint: (chatHistory: ChatMessage[]) => Promise<void>;
    clearHint: () => void;

    // Patient Video
    patientVideos: { idle: string | null; talking: string | null };
}

const AppContext = createContext<AppContextType | null>(null);

const useAppContext = (): AppContextType => {
    const context = useContext(AppContext);
    if (!context) throw new Error("useAppContext must be used within an AppContextProvider");
    return context;
};

// --- HELPER FUNCTIONS ---
const parseVideoFilename = (filename: string): ParsedVideo | null => {
    const state = filename.includes('talking') ? 'talking' : 'idle';

    let gender: 'Male' | 'Female' | null = null;
    if (filename.includes('boy') || filename.includes('man')) gender = 'Male';
    if (filename.includes('girl') || filename.includes('lady') || filename.includes('woman')) gender = 'Female';

    if (!gender) return null;

    let min_age = 0, max_age = 100;
    
    const ageRangeMatch = filename.match(/\(age_?-?(\d+)-(\d+)\)/);
    const agePlusMatch = filename.match(/\(age_?-?(\d+)\+\)/);

    if (ageRangeMatch) {
        min_age = parseInt(ageRangeMatch[1], 10);
        max_age = parseInt(ageRangeMatch[2], 10);
    } else if (agePlusMatch) {
        min_age = parseInt(agePlusMatch[1], 10);
        max_age = 120; // Set a high upper bound for "60+"
    } else {
        // Infer from subject if no explicit age range
        if (filename.startsWith('adolescent')) { min_age = 13; max_age = 19; }
        else if (filename.startsWith('boy') || filename.startsWith('girl')) { min_age = 7; max_age = 12; }
        else if (filename.startsWith('man') || filename.startsWith('lady')) { min_age = 20; max_age = 45; }
        else if (filename.startsWith('old_man') || filename.startsWith('old_woman')) { min_age = 46; max_age = 120; }
        else return null; // Cannot determine age range
    }

    return { file: filename, state, gender, min_age, max_age };
};


const AppContextProvider = ({ children }: { children: ReactNode }) => {
    // Auth & Profile State
    const [session, setSession] = useState<Session | null>(null);
    const [profile, setProfile] = useState<Profile | null>(null);
    const [isAuthLoading, setIsAuthLoading] = useState(true);
    const [authError, setAuthError] = useState<string | null>(null);
    const [streak, setStreak] = useState<Streak | null>(null);
    const [score, setScore] = useState<number | null>(null);
    const [caseLogs, setCaseLogs] = useState<CaseLog[]>([]);
    const [leaderboard, setLeaderboard] = useState<any[]>([]);

    // App State
    const [page, setPage] = useState<Page>('home');
    const [theme, setTheme] = useState<Theme>('light');
    const [isMobile, setIsMobile] = useState(window.innerWidth <= 800);
    
    // Case Generation State
    const [isGenerating, setIsGenerating] = useState(false);
    const [generationError, setGenerationError] = useState<string | null>(null);
    const [generationFilters, setGenerationFilters] = useState<GenerationFilters | null>(null);
    const [currentCase, setCurrentCase] = useState<DiagnosticCase | null>(null);
    
    // SOAP Note State
    const [soapNote, setSoapNote] = useState<string | null>(null);
    const [isGeneratingSoapNote, setIsGeneratingSoapNote] = useState(false);
    const [soapNoteError, setSoapNoteError] = useState<string | null>(null);
    
    // Hint State
    const [hint, setHint] = useState<string | null>(null);
    const [isGeneratingHint, setIsGeneratingHint] = useState(false);
    const [hintError, setHintError] = useState<string | null>(null);
    const [hintCount, setHintCount] = useState(MAX_HINTS);

    // Video State
    const [patientVideos, setPatientVideos] = useState<{ idle: string | null; talking: string | null }>({ idle: null, talking: null });
    const videoData = useMemo(() => VIDEO_FILENAMES.map(parseVideoFilename).filter(Boolean) as ParsedVideo[], []);

    const fetchAllUserData = async (user: User) => {
        try {
            const userId = user.id;
            const [profileData, streakData, logsData, leaderboardData, scoreData] = await Promise.all([
                getUserProfile(userId),
                getStreak(userId),
                getCaseLogs(userId),
                getLeaderboard(),
                getUserScore(userId),
            ]);

            if (profileData) {
                const fullProfile: Profile = {
                    ...profileData,
                    training_phase: user.user_metadata.training_phase || null,
                };
                setProfile(fullProfile);
            } else {
                setProfile(null);
            }
            
            setStreak(streakData);
            setCaseLogs(logsData);
            setLeaderboard(leaderboardData);
            setScore(scoreData);
        } catch (error) {
            console.error("Failed to fetch user data", error);
            setAuthError("Could not load your profile data.");
        }
    };

    useEffect(() => {
        // Mobile detection
        const handleResize = () => setIsMobile(window.innerWidth <= 800);
        window.addEventListener('resize', handleResize);

        // Handle Auth
        const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
            setSession(session);
            
            // For user metadata updates, update profile silently without a full-page loader or refetching all data.
            if (event === 'USER_UPDATED' && session?.user) {
                setProfile(prevProfile => {
                    if (!prevProfile) return null; // Avoid race conditions on initial sign-in.
                    return {
                        ...prevProfile,
                        training_phase: session.user.user_metadata.training_phase || null
                    };
                });
                return; // Don't affect loading state or fetch all data again.
            }

            // For major auth events (sign-in, sign-out, initial session), update all data.
            if (session?.user) {
                // Fetch user data in the background without awaiting. This prevents UI blocking.
                fetchAllUserData(session.user);
            } else {
                // If there's no session, clear all user-related data.
                setProfile(null);
                setStreak(null);
                setScore(null);
                setCaseLogs([]);
                setLeaderboard([]);
            }
            
            // Once we have determined the auth state, we can hide the anitial loader.
            // Data will continue to populate in the background.
            setIsAuthLoading(false);
        });

        // Load Theme & Hint Count
        const savedTheme = localStorage.getItem('theme') as Theme;
        if (savedTheme) setTheme(savedTheme);
        try {
            const savedHintUsage = localStorage.getItem(HINT_STORAGE_KEY);
            const today = new Date().toISOString().split('T')[0];
            if (savedHintUsage) {
                const { count, date } = JSON.parse(savedHintUsage);
                if (date === today) setHintCount(count);
                else localStorage.setItem(HINT_STORAGE_KEY, JSON.stringify({ count: MAX_HINTS, date: today }));
            } else {
                localStorage.setItem(HINT_STORAGE_KEY, JSON.stringify({ count: MAX_HINTS, date: today }));
            }
        } catch (error) { console.error("Failed to process hint usage", error); }

        return () => {
            authListener.subscription.unsubscribe();
            window.removeEventListener('resize', handleResize);
        }
    }, []);

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
    }, [theme]);

    const toggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light');

    const handleSignOut = async () => {
        await signOut();
        setPage('home'); // Redirect to home which will render AuthPage
    };

    const updateUserTrainingPhase = async (trainingPhase: TrainingPhase) => {
        if (!profile || !session?.user) return;
        try {
            const { error } = await supabase.auth.updateUser({
                data: { training_phase: trainingPhase }
            });
            if (error) throw error;
            // The onAuthStateChange listener will now handle the profile update seamlessly.
        } catch(error: any) {
            console.error("Failed to update training phase", error.message);
            // Optionally set an error state to show in UI
        }
    };

    const logCompletedCase = async (caseResult: CaseResultPayload) => {
        if (!session?.user) return;
        try {
            await logCaseCompletion(session.user.id, caseResult);
            // Refetch data to update UI
            await fetchAllUserData(session.user);
        } catch (error) {
            console.error("Failed to log case", error);
        }
    };

    const loadPatientVideos = async (profile: DiagnosticCase['patientProfile']) => {
        if (videoData.length === 0) {
            console.warn("No video data is available, cannot find patient videos.");
            setPatientVideos({ idle: null, talking: null });
            return;
        }

        const findBestVideo = (state: 'idle' | 'talking'): string | null => {
            const { gender, age, ethnicity } = profile;
            const availableVideos = videoData.filter(v => v.state === state);

            let bestMatch: ParsedVideo | null = null;
            let highestScore = -1;

            for (const video of availableVideos) {
                let score = 0;
                // Gender match is most important
                if (video.gender === gender) score += 4;
                // Age match is next
                if (age >= video.min_age && age <= video.max_age) score += 2;
                
                if (score > highestScore) {
                    highestScore = score;
                    bestMatch = video;
                }
            }

            // Fallback to a default if no decent match is found
            if (!bestMatch) {
                bestMatch = availableVideos.find(v => v.file.includes('man_idle') || v.file.includes('lady_idle')) || availableVideos[0] || null;
            }

            return bestMatch ? `/videos/${bestMatch.file}` : null;
        };
        
        const idleUrl = findBestVideo('idle');
        const talkingUrl = findBestVideo('talking');

        const preload = (url: string | null) => {
            if (!url) return Promise.reject(new Error("No URL provided for preload"));
            return fetch(url).then(res => { if (!res.ok) throw new Error(`Video not found at ${url}`); });
        };
        
        const preloadResults = await Promise.allSettled([preload(idleUrl), preload(talkingUrl)]);
        
        const finalIdleUrl = preloadResults[0].status === 'fulfilled' ? idleUrl : null;
        const finalTalkingUrl = preloadResults[1].status === 'fulfilled' ? talkingUrl : null;

        if (finalIdleUrl !== idleUrl || finalTalkingUrl !== talkingUrl) {
            console.warn("One or more patient videos failed to load. The visualizer may fall back to the icon.", {
                idle: { requested: idleUrl, loaded: finalIdleUrl },
                talking: { requested: talkingUrl, loaded: finalTalkingUrl },
            });
        }

        setPatientVideos({ idle: finalIdleUrl, talking: finalTalkingUrl });
    };

    const handleStartNewCase = useCallback((caseData: DiagnosticCase) => {
        if (!caseData?.title) {
            console.error("handleStartNewCase was called with invalid data.");
            return;
        }
        setCurrentCase(caseData);
        setSoapNote(null);
        setPage('simulation');
    }, []);

    const handleGenerateAndStart = async (filters: GenerationFilters) => {
        setGenerationFilters(filters);
        setIsGenerating(true);
        setGenerationError(null);
        try {
            let filtersForGeneration = { ...filters };

            // If no specialty is selected by the user, have the AI pick one.
            // This ensures the fun facts are relevant even for random cases.
            if (!filtersForGeneration.specialties || filtersForGeneration.specialties.length === 0) {
                const pickedSpecialty = await pickSpecialtyForCase(filters.trainingPhase);
                filtersForGeneration.specialties = [pickedSpecialty];
                // Update the context again so the splash screen can react and show specialty-specific facts.
                setGenerationFilters(filtersForGeneration);
            }
            
            const newCase = await generateCase(filtersForGeneration);
            await loadPatientVideos(newCase.patientProfile);
            handleStartNewCase(newCase);
        } catch (error) {
            console.error("Case generation failed:", error);
            setGenerationError(`Failed to prepare the simulation. ${error instanceof Error ? error.message : "An unknown error occurred."}`);
        } finally {
            setIsGenerating(false);
        }
    };

    const handleRegenerateCase = async () => {
        if (currentCase?.tags) {
            await handleGenerateAndStart({
                trainingPhase: currentCase.tags.trainingPhase,
                specialties: [currentCase.tags.specialty],
            });
        }
    };
    
    const handleGenerateSoapNote = async () => {
        if (!currentCase) return;
        setIsGeneratingSoapNote(true);
        setSoapNoteError(null);
        try {
            const note = await generateSoapNoteForCase(currentCase);
            setSoapNote(note);
        } catch (error) {
            console.error("SOAP Note generation failed:", error);
            setSoapNoteError(`Failed to generate SOAP note. ${error instanceof Error ? error.message : "An unknown error occurred."}`);
        } finally {
            setIsGeneratingSoapNote(false);
        }
    };
    
    const updateHintCount = (newCount: number) => {
        setHintCount(newCount);
        const today = new Date().toISOString().split('T')[0];
        localStorage.setItem(HINT_STORAGE_KEY, JSON.stringify({ count: newCount, date: today }));
    };



    const handleGenerateHint = async (chatHistory: ChatMessage[]) => {
        if (!currentCase || hintCount <= 0) return;
        setIsGeneratingHint(true);
        setHintError(null);
        setHint(null);
        try {
            const newHint = await generateHint(currentCase, chatHistory);
            setHint(newHint);
            updateHintCount(hintCount - 1);
        } catch (error) {
            console.error("Hint generation failed:", error);
            setHintError(`Failed to generate hint. ${error instanceof Error ? error.message : "An unknown error occurred."}`);
        } finally {
            setIsGeneratingHint(false);
        }
    };
    
    const clearHint = () => {
        setHint(null);
        setHintError(null);
    }

    const value = {
        session, profile, isAuthLoading, authError, streak, score, caseLogs, leaderboard, setProfile, handleSignOut, updateUserTrainingPhase, logCompletedCase,
        page, setPage, theme, toggleTheme, isMobile,
        isGenerating, generationError, generationFilters, currentCase, handleStartNewCase, handleGenerateAndStart, handleRegenerateCase,
        soapNote, isGeneratingSoapNote, soapNoteError, handleGenerateSoapNote,
        hint, hintCount, isGeneratingHint, hintError, handleGenerateHint, clearHint,
        patientVideos
    };

    return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

// --- UI COMPONENTS ---

const ProfileMenu = () => {
    const { profile, theme, toggleTheme, handleSignOut } = useAppContext();
    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    const getInitials = (name: string | null | undefined) => {
        if (!name) return 'U';
        return name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
    }

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    if (!profile) return null;

    return (
        <div className="profile-menu" ref={menuRef}>
            <button className="profile-avatar" onClick={() => setIsOpen(!isOpen)} onKeyDown={(e) => e.key === 'Enter' && setIsOpen(!isOpen)} aria-haspopup="true" aria-expanded={isOpen}>
                {getInitials(profile.full_name)}
            </button>
            <div className={`profile-dropdown ${isOpen ? 'open' : ''}`} role="menu">
                <div className="dropdown-header">
                    <h4>{profile.full_name || 'User'}</h4>
                    <p>{profile.email}</p>
                </div>
                <button role="menuitem" className="dropdown-item theme-toggle-item" onClick={toggleTheme}>
                    <div className="theme-switch">
                        {theme === 'light' ? <IconMoon /> : <IconSun />}
                        <span>Theme</span>
                    </div>
                    <span>{theme === 'light' ? 'Dark' : 'Light'}</span>
                </button>
                <button role="menuitem" className="dropdown-item" onClick={handleSignOut}>
                    <IconLogOut/>
                    <span>Sign Out</span>
                </button>
            </div>
        </div>
    )
}

const AppHeader = () => {
    const { session, setPage } = useAppContext();

    return (
        <header className="app-header">
            <div className="app-header-left">
                 <button className="app-header-title-button" onClick={() => setPage('home')}>
                    <h1 className="app-header-title">
                        <span className="medanna-med">Med</span><span className="medanna-anna">Anna</span>
                    </h1>
                 </button>
            </div>
            <div className="app-header-right">
                {session && <button className="button button-outline home-button-header" onClick={() => setPage('home')}><IconHome/> <span>Home</span></button>}
                {session ? <ProfileMenu /> : <div/>}
            </div>
        </header>
    );
}


const AuthPage = () => {
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [fullName, setFullName] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            if (isLogin) {
                await signIn({ email, password });
            } else {
                if (!fullName) {
                    setError("Full name is required.");
                    setLoading(false);
                    return;
                }
                await signUp({ email, password, fullName });
            }
        } catch (err: any) {
            setError(err.message || 'An unexpected error occurred.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <main className="app-container auth-page-wrapper">
            <div className="auth-container">
                <div className="auth-decoration-panel">
                    <div className="auth-logo">
                        <span className="medanna-med">Med</span><span className="medanna-anna">Anna</span>
                    </div>
                    <p>AI-Powered Diagnostic Simulator</p>
                </div>
                <div className="auth-form-panel">
                    <div className="auth-header">
                        <h2>{isLogin ? 'Welcome Back' : 'Create Account'}</h2>
                        <p>{isLogin ? 'Sign in to continue your practice' : 'Start your diagnostic journey'}</p>
                    </div>

                    <form className="auth-form" onSubmit={handleSubmit}>
                        {!isLogin && (
                            <div className="form-group">
                                <label htmlFor="fullName">Full Name</label>
                                <input id="fullName" className="input-field" type="text" value={fullName} onChange={e => setFullName(e.target.value)} required />
                            </div>
                        )}
                        <div className="form-group">
                            <label htmlFor="email">Email</label>
                            <input id="email" className="input-field" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
                        </div>
                        <div className="form-group">
                            <label htmlFor="password">Password</label>
                            <input id="password" className="input-field" type="password" value={password} onChange={e => setPassword(e.target.value)} required />
                        </div>
                        {error && <p className="alert alert-error">{error}</p>}
                        <button type="submit" className="button button-primary" disabled={loading}>
                            {loading ? <div className="loading-spinner"></div> : (isLogin ? 'Sign In' : 'Sign Up')}
                        </button>
                    </form>
                    
                    <div className="auth-toggle">
                        {isLogin ? "Don't have an account?" : "Already have an account?"}
                        <button onClick={() => { setIsLogin(!isLogin); setError(null); }}>
                            {isLogin ? 'Sign Up' : 'Sign In'}
                        </button>
                    </div>
                </div>
            </div>
        </main>
    );
};

const FilterSidebar = ({ filters, onFilterChange }: { filters: Partial<GenerationFilters>, onFilterChange: React.Dispatch<React.SetStateAction<Partial<GenerationFilters>>> }) => {
    const [openSections, setOpenSections] = useState<string[]>(['Specialty / System']);

    const toggleSection = (section: string) => {
        setOpenSections(prev => prev.includes(section) ? prev.filter(s => s !== section) : [...prev, section]);
    };
    
    const handleMultiSelectChange = (filterKey: 'specialties' | 'epas', value: string) => {
        onFilterChange(prev => {
            const currentValues = (prev[filterKey] as string[]) || [];
            const newValues = currentValues.includes(value)
                ? currentValues.filter(v => v !== value)
                : [...currentValues, value];
            return { ...prev, [filterKey]: newValues };
        });
    };

    const AccordionSectionFilter = ({ title, children }: { title: string, children: ReactNode }) => {
        const isOpen = openSections.includes(title);
        return (
            <div className={`accordion-section ${isOpen ? 'open' : ''}`}>
                <button className="accordion-header-button" onClick={() => toggleSection(title)} aria-expanded={isOpen}>
                    <span>{title}</span>
                    <IconChevronDown className="accordion-icon" />
                </button>
                <div className="accordion-content" hidden={!isOpen}>
                    <div className="accordion-content-inner">{children}</div>
                </div>
            </div>
        );
    };

    return (
        <aside className="filter-sidebar">
            <h2>Filter Your Case</h2>
            <AccordionSectionFilter title="Specialty / System">
                <div className="checkbox-group">
                    {ALL_SPECIALTIES.map(s => <label key={s}><input type="checkbox" checked={filters.specialties?.includes(s)} onChange={() => handleMultiSelectChange('specialties', s)} />{s}</label>)}
                </div>
            </AccordionSectionFilter>
            <AccordionSectionFilter title="EPA Focus">
                <div className="checkbox-group">
                    {ALL_EPAS.map(e => <label key={e}><input type="checkbox" checked={filters.epas?.includes(e)} onChange={() => handleMultiSelectChange('epas', e)} />{e.replace('-', ' ')}</label>)}
                </div>
            </AccordionSectionFilter>
            <div className="filter-group challenge-mode">
                <label>
                    <input type="checkbox" checked={filters.challengeMode} onChange={e => onFilterChange(p => ({...p, challengeMode: e.target.checked}))} />
                    Challenge Mode
                </label>
                <p>Generates complex, interdisciplinary cases.</p>
            </div>
        </aside>
    );
};

const CustomCaseSummary = ({ filters, onRemoveFilter }: { filters: Partial<GenerationFilters>, onRemoveFilter: (filterKey: 'specialties' | 'epas', value: string) => void }) => {
    const { specialties = [], epas = [] } = filters;
    const allFilters = [
        ...specialties.map(s => ({ key: 'specialties' as const, value: s })),
        ...epas.map(e => ({ key: 'epas' as const, value: e })),
    ];

    const hasFilters = allFilters.length > 0;

    return (
        <div className="custom-case-summary">
            <h3>Your Custom Case</h3>
            <p>
                {hasFilters ? (
                    <>
                        You will be seeing a patient from <strong>{specialties.length > 0 ? specialties.join(', ') : 'any specialty'}</strong> with a focus on <strong>{epas.length > 0 ? epas.join(', ') : 'any EPA'}</strong>.
                    </>
                ) : (
                    "You will be seeing a random patient based on your profile. Use the filters on the left to customize."
                )}
            </p>
            {hasFilters && (
                <div className="filter-pills-container">
                    {allFilters.map(({ key, value }) => (
                        <span key={`${key}-${value}`} className="filter-pill">
                            {value}
                            <button onClick={() => onRemoveFilter(key, value)}><IconX className="filter-pill-remove" /></button>
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
};

const trainingPhaseInfo: Record<TrainingPhase, { icon: React.FC; description: string }> = {
    'Pre-clinical': { icon: IconBook, description: "Build foundational knowledge in basic medical sciences." },
    'Para-clinical': { icon: IconMicroscope, description: "Bridge theory with pathology, pharmacology, and microbiology." },
    'Clinical': { icon: IconStethoscope, description: "Gain hands-on experience in wards and patient care." },
    'Internship': { icon: IconBriefcase, description: "Apply your skills in a supervised professional setting." },
    'NExT/FMGE Prep': { icon: IconGraduationCap, description: "Focus on high-yield topics for your licensing exams." },
};

const TrainingPhaseSelector = () => {
    const { profile, updateUserTrainingPhase } = useAppContext();
    const [isUpdating, setIsUpdating] = useState<TrainingPhase | null>(null);

    const handleSelectPhase = async (phase: TrainingPhase) => {
        setIsUpdating(phase);
        await updateUserTrainingPhase(phase);
        setIsUpdating(null);
    };

    return (
        <div className="training-phase-grid">
            {ALL_TRAINING_PHASES.map(phase => {
                const info = trainingPhaseInfo[phase];
                const Icon = info.icon;
                const isSelected = profile?.training_phase === phase;

                return (
                    <button
                        key={phase}
                        className={`training-phase-card ${isSelected ? 'selected' : ''}`}
                        onClick={() => handleSelectPhase(phase)}
                        disabled={isUpdating !== null}
                        aria-pressed={isSelected}
                    >
                        <div className="card-icon-wrapper">
                             <Icon />
                             {isUpdating === phase && <div className="loading-spinner-overlay"><div className="loading-spinner"></div></div>}
                        </div>
                        <div className="card-content">
                            <h4>{phase}</h4>
                            <p>{info.description}</p>
                        </div>
                        {isSelected && <div className="selected-indicator"><IconCheck /></div>}
                    </button>
                );
            })}
        </div>
    );
};


const NewCaseTab = () => {
    const { profile, handleGenerateAndStart, isGenerating, generationError } = useAppContext();
    const [filters, setFilters] = useState<Partial<GenerationFilters>>({
        trainingPhase: profile?.training_phase || undefined,
        specialties: [],
        epas: [],
        challengeMode: false,
    });

    useEffect(() => {
        if (profile?.training_phase) {
            setFilters(prev => ({ ...prev, trainingPhase: profile.training_phase as TrainingPhase }));
        }
    }, [profile]);

    const handleRemoveFilter = (filterKey: 'specialties' | 'epas', value: string) => {
        setFilters(prev => {
            const currentValues = (prev[filterKey] as string[]) || [];
            const newValues = currentValues.filter(v => v !== value);
            return { ...prev, [filterKey]: newValues };
        });
    };
    
    const handleGenerateClick = () => {
        if (!profile || !profile.training_phase) return;
        handleGenerateAndStart({
            trainingPhase: profile.training_phase as TrainingPhase,
            specialties: filters.specialties,
            epas: filters.epas,
            challengeMode: filters.challengeMode,
        });
    };

    return (
        <div className="generation-section">
            <FilterSidebar filters={filters} onFilterChange={setFilters} />

            <div className="generation-main-content">
                <div className="training-phase-section">
                    <h2>1. Select Your Training Phase</h2>
                    <p>This tailors case difficulty and is saved to your profile for future sessions.</p>
                    <TrainingPhaseSelector />
                </div>

                <div className="custom-case-generation">
                    <h2>2. Configure & Start Simulation</h2>
                    <CustomCaseSummary filters={filters} onRemoveFilter={handleRemoveFilter} />
                    <button className="button button-primary generate-button" onClick={handleGenerateClick} disabled={isGenerating || !profile?.training_phase}>
                        {isGenerating ? <div className="loading-spinner"></div> : "Chat with Patient"}
                    </button>
                    {!profile?.training_phase && <p className="alert alert-inline">Please select a training phase to start.</p>}
                    {generationError && <p className="alert alert-error">{generationError}</p>}
                </div>
            </div>
        </div>
    );
};

const ActivityLogTab = () => {
    const { caseLogs } = useAppContext();

    if (caseLogs.length === 0) {
        return <div className="empty-state">You haven't completed any cases yet. Go to the "New Case" tab to start one!</div>;
    }

    const getPerformanceScore = (mcqCorrect: number, mcqTotal: number) => {
        if (mcqTotal === 0) {
            return { displayScore: "N/A", className: "" };
        }
        // Scale: 0% correct -> 1.0, 100% correct -> 10.0
        const score = 1.0 + ((mcqCorrect / mcqTotal) * 9.0);
        
        let className = 'high';
        if (score < 4.0) className = 'low';
        else if (score < 7.5) className = 'medium';

        return { displayScore: score.toFixed(1), className };
    };

    return (
        <div className="activity-log-container">
            <table className="activity-log-table">
                <thead>
                    <tr>
                        <th>Case Title</th>
                        <th>Diagnosis Correct</th>
                        <th>Performance Score</th>
                        <th>Completed On</th>
                    </tr>
                </thead>
                <tbody>
                    {caseLogs.slice().reverse().map(log => {
                        let details;
                        try {
                            details = JSON.parse(log.case_details as string);
                        } catch (e) {
                            console.error("Failed to parse case_details", log.case_details);
                            details = { mcqCorrectCount: 0, mcqTotal: 0, diagnosisCorrect: false }; // Fallback
                        }
                        
                        const { displayScore, className } = getPerformanceScore(details.mcqCorrectCount, details.mcqTotal);
                        
                        return (
                            <tr key={log.id}>
                                <td data-label="Case Title">{log.case_title}</td>
                                <td data-label="Diagnosis Correct">
                                    <span className={`status-pill ${details.diagnosisCorrect ? 'status-correct' : 'status-incorrect'}`}>
                                        {details.diagnosisCorrect ? 'Correct' : 'Incorrect'}
                                    </span>
                                </td>
                                <td data-label="Performance Score">
                                    {displayScore !== "N/A" ? (
                                        <>
                                            <span className={`score-value ${className}`}>{displayScore}</span>
                                            <span className="score-range">(1.0 - 10.0)</span>
                                        </>
                                    ) : (
                                        "N/A"
                                    )}
                                </td>
                                <td data-label="Completed On">{new Date(log.created_at).toLocaleDateString()}</td>
                            </tr>
                        )
                    })}
                </tbody>
            </table>
        </div>
    );
};


const LeaderboardTab = () => {
    const { leaderboard, profile } = useAppContext();

    if (leaderboard.length === 0) {
        return <div className="empty-state">No scores on the leaderboard yet. Complete a case to get started!</div>;
    }
    
    return (
        <div className="leaderboard-container">
            <table className="leaderboard-table">
                <thead>
                    <tr>
                        <th>Rank</th>
                        <th>User</th>
                        <th>Score</th>
                    </tr>
                </thead>
                <tbody>
                    {leaderboard.map((entry, index) => {
                        const isCurrentUser = profile?.id === entry.user_id;
                        return (
                            <tr key={entry.user_id} className={isCurrentUser ? 'current-user' : ''}>
                                <td data-label="Rank" className="rank">#{index + 1}</td>
                                <td data-label="User">{entry.profiles?.full_name || 'Anonymous'}{isCurrentUser ? ' (You)' : ''}</td>
                                <td data-label="Score" className="score">{entry.score}</td>
                            </tr>
                        )
                    })}
                </tbody>
            </table>
        </div>
    );
};


const DashboardMetrics = () => {
    const { streak, caseLogs, score } = useAppContext();
    return (
        <div className="dashboard-metrics">
            <div className="metric-card">
                <div className="metric-icon streak"><IconFlame /></div>
                <div className="metric-info">
                    <h3>{streak?.current_streak ?? 0} Day{streak?.current_streak !== 1 && 's'}</h3>
                    <p>Current Streak</p>
                </div>
            </div>
             <div className="metric-card">
                <div className="metric-icon completed"><IconCheckCircle /></div>
                <div className="metric-info">
                    <h3>{caseLogs?.length ?? 0}</h3>
                    <p>Cases Completed</p>
                </div>
            </div>
             <div className="metric-card">
                <div className="metric-icon score"><IconTrophy /></div>
                <div className="metric-info">
                    <h3>{score ?? 0}</h3>
                    <p>Total Score</p>
                </div>
            </div>
        </div>
    );
}

const HomePage = () => {
    const { profile } = useAppContext();
    const [activeTab, setActiveTab] = useState<HomeTab>('new-case');

    return (
        <main className="app-container home-page">
            <div className="home-header">
                <h1>Welcome back, {profile?.full_name?.split(' ')[0] || 'Doctor'}!</h1>
                <p>Your patient just walked in. Time to begin diagnosis.</p>
            </div>
            
            <DashboardMetrics />
            
            <div className="home-content-wrapper">
                <div className="home-tab-nav">
                    <button className={`tab-nav-button ${activeTab === 'new-case' ? 'active' : ''}`} onClick={() => setActiveTab('new-case')}>
                        <IconStethoscope/> New Case
                    </button>
                    <button className={`tab-nav-button ${activeTab === 'activity' ? 'active' : ''}`} onClick={() => setActiveTab('activity')}>
                        <IconFileText/> My Activity
                    </button>
                     <button className={`tab-nav-button ${activeTab === 'leaderboard' ? 'active' : ''}`} onClick={() => setActiveTab('leaderboard')}>
                        <IconTrophy/> Leaderboard
                    </button>
                </div>
                
                <div className="home-content">
                    {activeTab === 'new-case' && <NewCaseTab />}
                    {activeTab === 'activity' && <ActivityLogTab />}
                    {activeTab === 'leaderboard' && <LeaderboardTab />}
                </div>
            </div>
        </main>
    );
};


const GeneratingCaseSplash = () => {
    const { generationFilters } = useAppContext();
    const [fact, setFact] = useState('');
    const [fade, setFade] = useState(true);

    const getFactsPool = useCallback(() => {
        const specialties = generationFilters?.specialties;
        if (specialties && specialties.length > 0) {
            const specialtyFacts = specialties.flatMap(s => MEDICAL_FUN_FACTS[s] || []);
            if (specialtyFacts.length > 0) return specialtyFacts;
        }
        return MEDICAL_FUN_FACTS['General'];
    }, [generationFilters]);
    
    useEffect(() => {
        const factsPool = getFactsPool();
        // Set initial fact, ensure it's not undefined if pool is empty
        setFact(factsPool[Math.floor(Math.random() * factsPool.length)] || "Loading...");

        const interval = setInterval(() => {
            setFade(false); // Start fade out
            setTimeout(() => {
                setFact(currentFact => {
                    const currentPool = getFactsPool(); // Re-evaluate pool in case filters changed
                    if (currentPool.length === 0) return "Loading...";
                    let newFact;
                    do {
                        newFact = currentPool[Math.floor(Math.random() * currentPool.length)];
                    } while (newFact === currentFact && currentPool.length > 1); // Avoid repeating the same fact
                    return newFact;
                });
                setFade(true); // Start fade in
            }, 500); // Time for fade out transition
        }, 5000); // Change fact every 5 seconds

        return () => clearInterval(interval);
    }, [getFactsPool]);


    return (
        <div className="splash-overlay">
            <div className="splash-content">
                <div className="ekg-animation">
                    <svg viewBox="0 0 100 30">
                        <path className="ekg-path" d="M0 15 L20 15 L25 10 L35 20 L40 15 L45 15 L50 22 L55 8 L60 15 L100 15" fill="none" strokeWidth="1" />
                    </svg>
                </div>
                <h2>Preparing Your Simulation...</h2>
                <p>Please wait while we set up your custom patient encounter.</p>

                <div className="fun-fact-box">
                    <h3>Did you know?</h3>
                    <p className={`fun-fact-text ${fade ? 'fade-in' : 'fade-out'}`}>{fact}</p>
                </div>
            </div>
        </div>
    );
};


const AccordionSection = ({ title, children, defaultOpen = false }: { title: string, children: ReactNode, defaultOpen?: boolean }) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);
    const toggleSection = () => setIsOpen(prev => !prev);
    
    return (
        <div className={`accordion-section ${isOpen ? 'open' : ''}`}>
            <button className="accordion-header-button" onClick={toggleSection} aria-expanded={isOpen}>
                <span>{title}</span>
                <IconChevronDown className="accordion-icon" />
            </button>
            <div className="accordion-content" hidden={!isOpen}>
                <div className="accordion-content-inner">{children}</div>
            </div>
        </div>
    );
};

const CaseTagsDisplay = ({ tags }: { tags: CaseTags | undefined }) => {
    if (!tags) return null;
    const { specialty, trainingPhase, cognitiveSkill, epas, curriculum } = tags;
    return (
        <>
            <div className="case-tags">
                <span className="tag-badge tag-specialty">{specialty}</span>
                <span className="tag-badge tag-phase">{trainingPhase}</span>
                <span className="tag-badge tag-skill">{cognitiveSkill}</span>
                {epas.map(epa => <span key={epa} className="tag-badge tag-epa">{epa}</span>)}
                {curriculum && <span className="tag-badge tag-framework">{curriculum.framework}</span>}
            </div>
            {curriculum && (
                <div className="competency-display">
                    <strong>Competency:</strong> {curriculum.competency}
                </div>
            )}
        </>
    );
};

const CaseInfoPanel = ({ currentCase }: { currentCase: DiagnosticCase | null }) => {
    const { isMobile } = useAppContext();

    if (!currentCase) {
        return <div className="panel case-info-panel"><p>Loading case...</p></div>;
    }
    
    return (
        <div className="panel case-info-panel">
             <div className="panel-header">
                <h2>{currentCase.title}</h2>
                <CaseTagsDisplay tags={currentCase.tags} />
                <p className="case-subtitle">{currentCase.patientProfile.name}, {currentCase.patientProfile.age}, {currentCase.patientProfile.gender}</p>
            </div>
            <div className="panel-content">
                <AccordionSection title="Chief Complaint" defaultOpen={true}>
                    <p className="chief-complaint-text">"{currentCase.chiefComplaint}"</p>
                </AccordionSection>
                <AccordionSection title="History of Present Illness" defaultOpen={!isMobile}>
                    <p>{currentCase.historyOfPresentIllness}</p>
                </AccordionSection>
                <AccordionSection title="Physical Exam" defaultOpen={!isMobile}><p style={{ whiteSpace: 'pre-wrap' }}>{currentCase.physicalExam}</p></AccordionSection>
                <AccordionSection title="Lab Results" defaultOpen={!isMobile}><p style={{ whiteSpace: 'pre-wrap' }}>{currentCase.labResults}</p></AccordionSection>
            </div>
        </div>
    )
}

const DiagnosisPanel = ({
    selectedDiagnosis,
    onSelectDiagnosis
}: {
    selectedDiagnosis: string | null;
    onSelectDiagnosis: (diagnosis: string) => void;
}) => {
    const { currentCase } = useAppContext();
    if (!currentCase) return <div className="panel actions-panel"><p>Loading...</p></div>;

    return (
        <div className="panel actions-panel">
            <div className="panel-content">
                <AccordionSection title="Potential Diagnoses" defaultOpen={true}>
                    <p>Select what you believe is the correct diagnosis.</p>
                    <div className="choice-options">
                        {currentCase.potentialDiagnoses.map(({ diagnosis, isCorrect }) => {
                            const isSelected = selectedDiagnosis === diagnosis;
                            const isRevealed = !!selectedDiagnosis;
                            return (
                                <button key={diagnosis}
                                    className={`choice-option ${isRevealed && isCorrect ? 'correct' : ''} ${isRevealed && isSelected && !isCorrect ? 'incorrect' : ''}`}
                                    onClick={() => onSelectDiagnosis(diagnosis)} disabled={isRevealed}>
                                    {isRevealed && (isCorrect || isSelected) && (isCorrect ? <IconCheck/> : <IconX/>)}
                                    {diagnosis}
                                </button>
                            );
                        })}
                    </div>
                    {selectedDiagnosis && <div className="feedback-box alert"><p><strong>Explanation:</strong> {currentCase.correctDiagnosisExplanation}</p></div>}
                </AccordionSection>
            </div>
        </div>
    );
};

const QuestionsPanel = ({
    selectedDiagnosis,
    selectedMcqAnswers,
    onSelectMcqAnswer
}: {
    selectedDiagnosis: string | null;
    selectedMcqAnswers: Record<number, number>;
    onSelectMcqAnswer: (mcqIndex: number, optionIndex: number) => void;
}) => {
    const {
        currentCase,
        soapNote, isGeneratingSoapNote, soapNoteError, handleGenerateSoapNote,
        logCompletedCase, setPage
    } = useAppContext();

    if (!currentCase) return <div className="panel actions-panel"><p>Loading...</p></div>;

    const allMcqsAnswered = currentCase.mcqs.length > 0 && Object.keys(selectedMcqAnswers).length === currentCase.mcqs.length;

    const handleFinishCase = () => {
        if (!currentCase) return;
        const diagnosisCorrect = currentCase.potentialDiagnoses.find(d => d.diagnosis === selectedDiagnosis)?.isCorrect || false;
        const mcqCorrectCount = Object.entries(selectedMcqAnswers).filter(([idx, answer]) =>
            currentCase.mcqs[parseInt(idx)].correctAnswerIndex === answer
        ).length;

        const caseResultDetails = {
            diagnosisCorrect,
            mcqCorrectCount,
            mcqTotal: currentCase.mcqs.length
        };
        
        logCompletedCase({
            case_title: currentCase.title,
            case_details: JSON.stringify(caseResultDetails),
            score: (diagnosisCorrect ? 50 : 0) + (mcqCorrectCount * 10),
        });
        setPage('home');
    };
    
    return (
        <div className="panel actions-panel">
            <div className="panel-content">
                {!selectedDiagnosis ? (
                    <div className="info-box">Please select a diagnosis first to unlock the clinical questions.</div>
                ) : (
                    <>
                        <AccordionSection title="Clinical Questions" defaultOpen={true}>
                            {currentCase.mcqs.length > 0 ? currentCase.mcqs.map((mcq, index) => (
                                <div key={index} className="mcq-item">
                                    <p><strong>{index + 1}. {mcq.question}</strong></p>
                                    <div className="choice-options">
                                        {mcq.options.map((option, optionIndex) => {
                                            const isSelected = selectedMcqAnswers[index] === optionIndex;
                                            const isRevealed = selectedMcqAnswers[index] !== undefined;
                                            const isCorrect = mcq.correctAnswerIndex === optionIndex;
                                            return (
                                                <button key={optionIndex}
                                                    className={`choice-option ${isRevealed && isCorrect ? 'correct' : ''} ${isRevealed && isSelected && !isCorrect ? 'incorrect' : ''}`}
                                                    onClick={() => onSelectMcqAnswer(index, optionIndex)} disabled={isRevealed}>
                                                    {isRevealed && (isCorrect || isSelected) && (isCorrect ? <IconCheck/> : <IconX/>)}
                                                    {option}
                                                </button>
                                            );
                                        })}
                                    </div>
                                    {selectedMcqAnswers[index] !== undefined && <div className="feedback-box alert"><p><strong>Explanation:</strong> {mcq.explanation}</p></div>}
                                </div>
                            )) : <p>No clinical questions for this case.</p>}
                        </AccordionSection>
                        
                        <AccordionSection title="SOAP Note">
                            {soapNote ? (
                                <p style={{ whiteSpace: 'pre-wrap' }}>{soapNote}</p>
                            ) : (
                                <div className="soap-note-generation">
                                    <button className="button button-primary" onClick={handleGenerateSoapNote} disabled={isGeneratingSoapNote} style={{width: '100%'}}>
                                        {isGeneratingSoapNote && <div className="loading-spinner"></div>}
                                        Generate SOAP Note
                                    </button>
                                    {soapNoteError && <p className="alert alert-error">{soapNoteError}</p>}
                                </div>
                            )}
                        </AccordionSection>

                        {allMcqsAnswered && (
                           <div className="finish-case-action">
                             <button className="button button-primary" onClick={handleFinishCase}>Finish Case & Return Home</button>
                           </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

const SimulationPage = () => {
    const { currentCase } = useAppContext();
    const [selectedDiagnosis, setSelectedDiagnosis] = useState<string | null>(null);
    const [selectedMcqAnswers, setSelectedMcqAnswers] = useState<Record<number, number>>({});
    const [activeTab, setActiveTab] = useState<ActiveTab>('chat');

    useEffect(() => {
        // Reset state when case changes
        setSelectedDiagnosis(null);
        setSelectedMcqAnswers({});
        setActiveTab('chat');
    }, [currentCase]);

    const handleSelectDiagnosis = (diagnosis: string) => {
        if (!selectedDiagnosis) {
            setSelectedDiagnosis(diagnosis);
            setActiveTab('questions'); // Auto-switch to questions after diagnosis
        }
    };

    const handleSelectMcqAnswer = (mcqIndex: number, optionIndex: number) => {
        if (selectedMcqAnswers[mcqIndex] === undefined) {
            setSelectedMcqAnswers(prev => ({ ...prev, [mcqIndex]: optionIndex }));
        }
    };

    return (
        <main className="app-container simulation-page">
            <CaseInfoPanel currentCase={currentCase} />
            <div className="central-panel">
                <PatientVisualizer />
            </div>
            <div className="right-panel">
                <div className="tab-nav">
                    <button className={`tab-nav-button ${activeTab === 'chat' ? 'active' : ''}`} onClick={() => setActiveTab('chat')}>Chat</button>
                    <button className={`tab-nav-button ${activeTab === 'diagnosis' ? 'active' : ''}`} onClick={() => setActiveTab('diagnosis')}>Diagnosis</button>
                    <button className={`tab-nav-button ${activeTab === 'questions' ? 'active' : ''}`} onClick={() => setActiveTab('questions')}>Questions</button>
                </div>

                {activeTab === 'chat' && <ChatWindow />}
                {activeTab === 'diagnosis' && (
                    <DiagnosisPanel
                        selectedDiagnosis={selectedDiagnosis}
                        onSelectDiagnosis={handleSelectDiagnosis}
                    />
                )}
                {activeTab === 'questions' && (
                    <QuestionsPanel
                        selectedDiagnosis={selectedDiagnosis}
                        selectedMcqAnswers={selectedMcqAnswers}
                        onSelectMcqAnswer={handleSelectMcqAnswer}
                    />
                )}
            </div>
        </main>
    );
};


const PatientVisualizer = () => {
    const { currentCase, patientVideos } = useAppContext();
    const [isSpeaking, setIsSpeaking] = useState(false);
    const idleVideoRef = useRef<HTMLVideoElement>(null);
    const talkingVideoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        const handleSpeechStart = () => setIsSpeaking(true);
        const handleSpeechEnd = () => setIsSpeaking(false);
        window.addEventListener('speech-start', handleSpeechStart);
        window.addEventListener('speech-end', handleSpeechEnd);
        return () => {
            window.removeEventListener('speech-start', handleSpeechStart);
            window.removeEventListener('speech-end', handleSpeechEnd);
        };
    }, []);

    useEffect(() => {
        const idleVideo = idleVideoRef.current;
        const talkingVideo = talkingVideoRef.current;

        if (!idleVideo || !talkingVideo) return;

        if (isSpeaking) {
            idleVideo.pause();
            talkingVideo.currentTime = 0;
            talkingVideo.play().catch(e => console.error("Talking video playback failed:", e));
        } else {
            talkingVideo.pause();
            idleVideo.play().catch(e => console.error("Idle video playback failed:", e));
        }
    }, [isSpeaking, patientVideos]);
    
    if (!currentCase) return null;

    const patientName = currentCase.patientProfile.age < 7 
        ? `${currentCase.patientProfile.name}'s Mother` 
        : currentCase.patientProfile.name;
        
    const hasVideos = patientVideos.idle && patientVideos.talking;

    return (
        <div className="patient-visualizer">
            {hasVideos ? (
                <>
                    <video
                        key={patientVideos.idle}
                        ref={idleVideoRef}
                        src={patientVideos.idle!}
                        className={`patient-video ${!isSpeaking ? 'visible' : ''}`}
                        autoPlay
                        loop
                        muted
                        playsInline
                    />
                    <video
                        key={patientVideos.talking}
                        ref={talkingVideoRef}
                        src={patientVideos.talking!}
                        className={`patient-video ${isSpeaking ? 'visible' : ''}`}
                        muted
                        playsInline
                    />
                </>
            ) : (
                <div className="patient-icon-fallback">
                    <div className={`patient-icon ${isSpeaking ? 'speaking' : ''}`}>
                        <IconPatient />
                    </div>
                </div>
            )}
            <div className="patient-overlay-content">
                <h3 className="patient-name">{patientName}</h3>
                {isSpeaking && 
                    <div className="speaking-indicator">
                        <span className="speaking-indicator-bar"></span>
                        <span className="speaking-indicator-bar"></span>
                        <span className="speaking-indicator-bar"></span>
                        <span className="speaking-indicator-bar"></span>
                    </div>
                }
            </div>
        </div>
    );
};

const ChatWindow = () => {
    const { currentCase, handleGenerateHint, hint, hintCount, isGeneratingHint, hintError, clearHint } = useAppContext();
    const [chat, setChat] = useState<Chat | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [userInput, setUserInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [speechError, setSpeechError] = useState<string | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const messagesRef = useRef(messages);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    messagesRef.current = messages; // Keep ref updated with the latest messages

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    useEffect(() => {
        if (!currentCase) return;
        const chatHistoryKey = `chatHistory_${currentCase.title}`;

        let initialMessages: ChatMessage[] = [];
        try {
            const savedMessages = localStorage.getItem(chatHistoryKey);
            if (savedMessages) {
                initialMessages = JSON.parse(savedMessages);
            }
        } catch (error) {
            console.error("Failed to parse chat history from localStorage. Clearing it.", error);
            localStorage.removeItem(chatHistoryKey);
        }
        setMessages(initialMessages);
        
        // Create chat instance
        createChatForCase(currentCase).then(setChat).catch(err => console.error("Failed to create chat:", err));

        // Return a cleanup function to save history on unmount
        return () => {
            if (messagesRef.current.length > 0) {
                localStorage.setItem(chatHistoryKey, JSON.stringify(messagesRef.current));
            } else {
                 // If there are no messages, remove the key to keep storage clean
                localStorage.removeItem(chatHistoryKey);
            }
            // Stop any ongoing speech when component unmounts
            if (audioRef.current) {
                audioRef.current.pause();
                window.dispatchEvent(new CustomEvent('speech-end'));
            }
        };
    }, [currentCase]);

    const getVoiceId = (gender: 'Male' | 'Female' | 'Other', age: number) => {
        // Use standard, free voices that are reliably available
        if (age < 18) {
            return 'EXAVITQu4vr4xnSDxMaL'; // "Bella" (younger female, good for children/adolescents)
        }
        if (gender === 'Male') {
            return 'pNInz6obpgDQGcFmaJgB'; // "Adam" (standard male voice)
        }
        // Default to female for 'Female' or 'Other'
        return '21m00Tcm4TlvDq8ikWAM'; // "Rachel" (standard female voice)
    };

    const speak = useCallback(async (text: string, gender: 'Male' | 'Female' | 'Other', age: number) => {
        const ELEVENLABS_API_KEY = "sk_93aed662e047c36df99f3a065658936bb3e829158c9c29e5";
        setSpeechError(null);
        if (isMuted || !text) return;

        // Stop any currently playing audio
        if (audioRef.current) {
            audioRef.current.pause();
        }

        const cleanText = text.replace(/\*.*?\*/g, '').replace(/\s+/g, ' ').trim();
        if (!cleanText) return;
        
        window.dispatchEvent(new CustomEvent('speech-start'));
        
        const voiceId = getVoiceId(gender, age);
        const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;
        const headers = {
            'Accept': 'audio/mpeg',
            'Content-Type': 'application/json',
            'xi-api-key': ELEVENLABS_API_KEY
        };
        const body = JSON.stringify({
            text: cleanText,
            model_id: 'eleven_multilingual_v2',
            voice_settings: { stability: 0.5, similarity_boost: 0.75 }
        });

        try {
            const response = await fetch(url, { method: 'POST', headers, body });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail?.message || `HTTP error! status: ${response.status}`);
            }
            const blob = await response.blob();
            const audioUrl = URL.createObjectURL(blob);
            const audio = new Audio(audioUrl);
            audioRef.current = audio;
            audio.play();

            audio.onended = () => {
                window.dispatchEvent(new CustomEvent('speech-end'));
                URL.revokeObjectURL(audioUrl);
                audioRef.current = null;
            };
            audio.onerror = (e) => {
                console.error("Audio playback error:", e);
                setSpeechError("Failed to play patient audio.");
                window.dispatchEvent(new CustomEvent('speech-end'));
                URL.revokeObjectURL(audioUrl);
                audioRef.current = null;
            };

        } catch (error) {
            console.error("ElevenLabs API error:", error);
            setSpeechError(`Text-to-speech failed. ${error instanceof Error ? error.message : "Unknown error"}`);
            window.dispatchEvent(new CustomEvent('speech-end'));
        }
    }, [isMuted]);

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!userInput.trim() || !chat || isLoading) return;
        const userMessage: ChatMessage = { sender: 'user', text: userInput, timestamp: new Date().toISOString() };
        setMessages(prev => [...prev, userMessage]);
        setUserInput('');
        setIsLoading(true);
        try {
            const response = await chat.sendMessage({ message: userInput });
            const patientMessage: ChatMessage = { sender: 'patient', text: response.text, timestamp: new Date().toISOString() };
            setMessages(prev => [...prev, patientMessage]);
            if(currentCase?.patientProfile) {
                speak(response.text, currentCase.patientProfile.gender, currentCase.patientProfile.age);
            }
        } catch (error) {
            console.error('Error sending message:', error);
            const errorMessage: ChatMessage = { sender: 'patient', text: `Sorry, I'm having trouble communicating. (${error instanceof Error ? error.message : "Unknown error"})`, timestamp: new Date().toISOString() };
            setMessages(prev => [...prev, errorMessage]);
        } finally {
            setIsLoading(false);
        }
    };

    // Auto-resize textarea
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto'; // Reset height
            const scrollHeight = textareaRef.current.scrollHeight;
            textareaRef.current.style.height = `${scrollHeight}px`;
        }
    }, [userInput]);

    return (
        <div className="panel chat-window">
            <div className="chat-header">
                <div className="chat-header-info">
                    <h3>Chat with {currentCase && currentCase.patientProfile.age < 7 ? "Patient's Mother" : 'Patient'}</h3>
                    <p>Ask {currentCase?.patientProfile.name || 'the patient'} questions.</p>
                </div>
                <div className="hint-button-container">
                    <span className="hint-count" title={`${hintCount} hints remaining`}>{hintCount}</span>
                    <button className="button button-outline" onClick={() => handleGenerateHint(messages)}
                        disabled={isGeneratingHint || hintCount <= 0} title="Get a hint">
                        {isGeneratingHint ? <div className="loading-spinner"></div> : <IconLightbulb />} Get Hint
                    </button>
                </div>
            </div>
            <div className="chat-messages">
                {messages.length === 0 ? <div className="chat-empty-state">No messages yet. Start the conversation.</div> : messages.map((msg, index) => (
                    <div key={index} className={`chat-message message-${msg.sender}`}>
                        {msg.sender === 'patient' && <div className="avatar-icon"><IconPatient /></div>}
                        <div className="chat-bubble">{msg.text}</div>
                    </div>
                ))}
                {isLoading && <div className="chat-message message-patient"><div className="avatar-icon"><IconPatient /></div><div className="chat-bubble">Thinking...</div></div>}
                <div ref={messagesEndRef} />
            </div>

            {(hint || hintError) && (
                <div className="hint-display"><IconLightbulb /><span>{hint || hintError}</span><button className="close-button" onClick={clearHint}><IconClose /></button></div>
            )}
            {speechError && (
                 <div className="speech-alert"><IconAlertTriangle /><span>{speechError}</span><button className="close-button" onClick={() => setSpeechError(null)}><IconClose /></button></div>
            )}
            <form className="chat-input-form" onSubmit={handleSendMessage}>
                <button 
                    type="button" 
                    className="icon-button" 
                    onClick={() => setIsMuted(!isMuted)} 
                    aria-label={isMuted ? 'Unmute' : 'Mute'}
                    title={isMuted ? 'Unmute' : 'Mute'}
                >
                    {isMuted ? <IconVolumeOff /> : <IconVolume />}
                </button>
                <textarea ref={textareaRef} value={userInput} onChange={e => setUserInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(e); } }}
                    placeholder={`Message ${currentCase && currentCase.patientProfile.age < 7 ? "the mother" : currentCase?.patientProfile.name}...`} rows={1} disabled={isLoading || !chat} />
                <button type="submit" className="icon-button button-primary" disabled={isLoading || !userInput.trim()}>
                    {isLoading ? <div className="loading-spinner"></div> : <IconSend />}
                </button>
            </form>
        </div>
    );
};

// --- MAIN APP COMPONENT ---
const App = () => {
    const { session, isAuthLoading, page, isGenerating } = useAppContext();

    const renderPage = () => {
        if (isAuthLoading) {
            return <div className="global-loading-spinner"><div className="loading-spinner"></div></div>;
        }
        if (!session) {
            return <AuthPage />;
        }
        switch (page) {
            case 'simulation': return <SimulationPage />;
            case 'home':
            default:
                return <HomePage />;
        }
    };
    
    return (
        <div className="app-wrapper">
           <AppHeader/>
           {isGenerating && <GeneratingCaseSplash />}
           {renderPage()}
        </div>
    )
};

const root = createRoot(document.getElementById('root')!);
root.render(
    <StrictMode>
        <AppContextProvider>
            <App />
        </AppContextProvider>
    </StrictMode>
);