/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useState, useEffect, useCallback, useRef, StrictMode, ReactNode, createContext, useContext, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { generateCase, createChatForCase, DiagnosticCase, MCQ, generateSoapNoteForCase, generateHint, CaseTags, GenerationFilters, pickSpecialtyForCase, pickBestVideo, Chat } from './services/geminiService';
import { supabase, signIn, signUp, signOut, getUserProfile, updateUserProfile, getNotifications, markNotificationAsRead as supabaseMarkNotificationAsRead, markAllNotificationsAsRead as supabaseMarkAllNotificationsAsRead, Notification, NotificationType, Profile } from './services/supabaseService';
import { Session, User } from '@supabase/supabase-js';


// --- TYPE DEFINITIONS ---
type Specialty = 'Internal Medicine' | 'Pediatrics' | 'Surgery' | 'Obstetrics & Gynecology' | 'Psychiatry' | 'Cardiology' | 'Neurology' | 'Dermatology' | 'Emergency Medicine';
type TrainingPhase = 'Pre-clinical' | 'Para-clinical' | 'Clinical' | 'Internship' | 'NExT/FMGE Prep';
type CognitiveSkill = 'Recall' | 'Application' | 'Analysis';
type EPA = 'History-taking' | 'Physical Exam' | 'Diagnosis' | 'Management';
type Page = 'home' | 'simulation';
type Theme = 'light' | 'dark';
type ActiveTab = 'chat' | 'diagnosis' | 'questions' | 'case';
type HomeTab = 'home' | 'case' | 'profile';


export interface ChatMessage {
    sender: 'user' | 'patient' | 'system';
    text: string;
    timestamp: string;
}

// --- CONSTANTS & SEED DATA ---
const ALL_SPECIALTIES: Specialty[] = ['Internal Medicine', 'Pediatrics', 'Surgery', 'Obstetrics & Gynecology', 'Psychiatry', 'Cardiology', 'Neurology', 'Dermatology', 'Emergency Medicine'];
const ALL_TRAINING_PHASES: TrainingPhase[] = ['Pre-clinical', 'Para-clinical', 'Clinical', 'Internship', 'NExT/FMGE Prep'];
const ALL_EPAS: EPA[] = ['History-taking', 'Physical Exam', 'Diagnosis', 'Management'];
const MAX_HINTS = 10;
const HINT_STORAGE_KEY = 'medanna_hintUsage_v2';

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
const IconStethoscope = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4a2 2 0 1 0 4 0a2 2 0 1 0-4 0"/><path d="M8 4h1a2 2 0 0 1 2 2v2a4 4 0 0 1-4 4H5a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2h-1"/><path d="M17 4a2 2 0 1 0 4 0a2 2 0 1 0-4 0"/></svg>;
const IconGraduationCap = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"/><path d="M22 10v6"/><path d="M6 12.5V16a6 6 0 0 0 12 0v-3.5"/></svg>;
const IconBriefcase = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="14" x="2" y="7" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>;
const IconMenu = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>;
const IconClose = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>;
const IconAlertTriangle = ({ className }: { className?: string }) => <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>;
const IconCheck = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>;
const IconX = ({className}: {className?: string}) => <svg className={className} xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>;
const IconChevronDown = ({ className }: { className?: string }) => <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>;
const IconHome = ({className, isActive}: {className?: string, isActive?: boolean}) => <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill={isActive ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>;
const IconSun = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>;
const IconMoon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>;
const IconSend = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>;
const IconPatient = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z"/><path d="M19 22v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/></svg>;
const IconLightbulb = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>;
const IconUser = ({className, isActive}: {className?: string, isActive?: boolean}) => <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill={isActive ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
const IconDashboard = ({className, isActive}: {className?: string, isActive?: boolean}) => <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill={isActive ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>;
const IconLogOut = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>;
const IconFileText = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>;
const IconBell = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>;
const IconAward = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 17 17 23 15.79 13.88"/></svg>;
const IconMail = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>;
const IconChevronLeft = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>;
const IconSettings = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 0 2l-.15.08a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l-.22-.38a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1 0 2l.15.08a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>;
const IconGift = () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>;
const IconArrowRight = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>;
const IconHeart = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>;
const IconBrain = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v1.23a.5.5 0 0 0 .3.46l4.43 2.22a2.5 2.5 0 0 1 1.47 3.32l-1.04 2.56a2.5 2.5 0 0 1-3.32 1.47l-4.43-2.22a.5.5 0 0 0-.3-.46V9.5A2.5 2.5 0 0 1 7 7 2.5 2.5 0 0 1 9.5 4.5 2.5 2.5 0 0 1 12 7v3.5"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v1.23a.5.5 0 0 1-.3.46l-4.43 2.22a2.5 2.5 0 0 0-1.47 3.32l1.04 2.56a2.5 2.5 0 0 0 3.32 1.47l4.43-2.22a.5.5 0 0 1 .3-.46V9.5A2.5 2.5 0 0 0 17 7a2.5 2.5 0 0 0-2.5-2.5Z"/><path d="M6 16a1 1 0 0 1-1-1v-2.5a.5.5 0 0 1 .5-.5.5.5 0 0 0 .5-.5V10a1 1 0 0 1 1-1h1"/><path d="M18 16a1 1 0 0 0 1-1v-2.5a.5.5 0 0 0-.5-.5.5.5 0 0 1-.5-.5V10a1 1 0 0 0-1-1h-1"/></svg>;
const IconScalpel = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.19 21.19 2.81 2.81"/><path d="M18.37 3.63 8 14l-4.37.75c-2.3.4-3.56 3.1-2.12 4.54l.15.15c1.44 1.44 4.14.18 4.54-2.12L7 16l10.37-10.37Z"/></svg>;
const IconActivity = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>;
const IconBaby = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 12.5a5 5 0 0 0 5 5"/><path d="M9 8.5a5 5 0 0 1 5 5"/><path d="M11.5 2a.5.5 0 0 0-1 0V3a.5.5 0 0 0 1 0Z"/><path d="M18 12.5a5 5 0 0 0 5-5A5 5 0 0 0 14 6c-1.5 0-2.8 1-3.5 2.5"/><path d="M6 12.5a5 5 0 0 1-5-5A5 5 0 0 1 10 6c1.5 0 2.8 1 3.5 2.5"/><path d="M3 20.5a.5.5 0 0 0 1 0V19a.5.5 0 0 0-1 0Z"/><path d="M21 20.5a.5.5 0 0 1-1 0V19a.5.5 0 0 1 1 0Z"/><path d="M12 22a.5.5 0 0 0 0-1h-2a.5.5 0 0 0 0 1Z"/><circle cx="12" cy="12" r="10"/></svg>;
const IconBottle = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 5h4"/><path d="M8 2h8"/><path d="M7 5v11a5 5 0 0 0 10 0V5"/><path d="M12 12H7"/><path d="M12 17h5"/></svg>;
const IconSparkles = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.5 3L7 7.5l3 1.5L11.5 12l1.5-3L16 7.5l-3-1.5z"/><path d="M5 13l-1.5 3L0 17.5l3 1.5L4.5 22l1.5-3L9 17.5l-3-1.5z"/><path d="M19 13l-1.5 3L14 17.5l3 1.5L18.5 22l1.5-3L23 17.5l-3-1.5z"/></svg>;
const IconHandPlaster = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 12a2 2 0 1 0 4 0 2 2 0 1 0-4 0"/><path d="M16 12a2 2 0 1 0 4 0 2 2 0 1 0-4 0"/><path d="M12 16a2 2 0 1 0 4 0 2 2 0 1 0-4 0"/><path d="M16 16a2 2 0 1 0 4 0 2 2 0 1 0-4 0"/><path d="M18 8a2 2 0 1 0-4 0v1a2 2 0 1 0 4 0V8Z"/><path d="M18 5a1 1 0 0 0-1-1h-2a1 1 0 0 0-1 1v1a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1V5Z"/><path d="M18.8 3.2a1 1 0 0 0-1.6 1.2 5 5 0 0 1-1.2 3.6 5 5 0 0 0-3.6 1.2 1 1 0 0 0 1.2 1.6 7 7 0 0 0 5.2-1.7 7 7 0 0 1 1.7-5.2 1 1 0 0 0-1.7-1.2Z"/><path d="M7 19.5c.2.2.5.2.7 0l2.9-2.9c.2-.2.2-.5 0-.7l-1.2-1.2c-.2-.2-.5-.2-.7 0l-2.9 2.9c-.2.2-.2.5 0 .7l1.2 1.2Z"/><path d="M4.6 20a2.5 2.5 0 0 1-3.4-3.4l.6-.6a2.5 2.5 0 0 1 3.4 3.4l-.6.6Z"/><path d="M11 11.5c.2.2.5.2.7 0l2.9-2.9c.2-.2.2-.5 0-.7l-1.2-1.2c-.2-.2-.5-.2-.7 0L10 9.6c-.2.2-.2.5 0 .7l1.2 1.2Z"/></svg>;
const IconSearch = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>;
const IconUsers = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>;


// --- REACT CONTEXT ---
interface AppContextType {
    // Auth & Profile
    session: Session | null;
    profile: Profile | null;
    isAuthLoading: boolean;
    authError: string | null;
    setProfile: (profile: Profile | null) => void;
    handleSignOut: () => void;
    updateUserTrainingPhase: (trainingPhase: TrainingPhase) => Promise<void>;

    // App State
    page: Page;
    setPage: (page: Page) => void;
    homeTab: HomeTab;
    setHomeTab: (tab: HomeTab) => void;
    theme: Theme;
    toggleTheme: () => void;
    isMobile: boolean;
    isMobileMenuOpen: boolean;
    setIsMobileMenuOpen: (isOpen: boolean) => void;
    
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
    hintCount: number;
    getHintCount: () => number;
    updateHintCount: (newCount: number) => void;

    // Patient Video (now stores video IDs)
    patientVideos: { idle: string | null; talking: string | null; gender: 'Male' | 'Female' | null; };

    // Notifications
    notifications: Notification[];
    unreadCount: number;
    markNotificationAsRead: (notificationId: number) => Promise<void>;
    markAllNotificationsAsRead: () => Promise<void>;
}

const AppContext = createContext<AppContextType | null>(null);

const useAppContext = (): AppContextType => {
    const context = useContext(AppContext);
    if (!context) throw new Error("useAppContext must be used within an AppContextProvider");
    return context;
};

// --- HELPER FUNCTIONS ---
const timeAgo = (isoDate: string): string => {
    const date = new Date(isoDate);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    let interval = seconds / 31536000;
    if (interval > 1) return `${Math.floor(interval)} years ago`;
    interval = seconds / 2592000;
    if (interval > 1) return `${Math.floor(interval)} months ago`;
    interval = seconds / 86400;
    if (interval > 1) return `${Math.floor(interval)} days ago`;
    interval = seconds / 3600;
    if (interval > 1) return `${Math.floor(interval)} hours ago`;
    interval = seconds / 60;
    if (interval > 1) return `${Math.floor(interval)} minutes ago`;
    return `${Math.floor(seconds)} seconds ago`;
};

const getInitials = (name: string | null | undefined) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
}

const AppContextProvider = ({ children }: { children: ReactNode }) => {
    // Auth & Profile State
    const [session, setSession] = useState<Session | null>(null);
    const [profile, setProfile] = useState<Profile | null>(null);
    const [isAuthLoading, setIsAuthLoading] = useState(true);
    const [authError, setAuthError] = useState<string | null>(null);

    // App State
    const [page, setPage] = useState<Page>('home');
    const [homeTab, setHomeTab] = useState<HomeTab>('home');
    const [theme, setTheme] = useState<Theme>('light');
    const [isMobile, setIsMobile] = useState(window.innerWidth <= 800);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    
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
    const [hintCount, setHintCount] = useState(MAX_HINTS);

    // Video State
    const [patientVideos, setPatientVideos] = useState<{ idle: string | null; talking: string | null; gender: 'Male' | 'Female' | null }>({ idle: null, talking: null, gender: null });


    // Notification State
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);

    const toggleTheme = () => {
        setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
    };
    
    const getHintCount = useCallback(() => {
        try {
            const savedHintUsage = localStorage.getItem(HINT_STORAGE_KEY);
            const today = new Date().toISOString().split('T')[0];
            if (savedHintUsage) {
                const { count, date } = JSON.parse(savedHintUsage);
                if (date === today) return count;
            }
        } catch (error) { console.error("Failed to get hint count", error); }
        return MAX_HINTS;
    }, []);

    const fetchAllUserData = async (user: User) => {
        try {
            const userId = user.id;
            const [profileData, notificationsData] = await Promise.all([
                getUserProfile(userId),
                getNotifications(userId),
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
            
            setNotifications(notificationsData);
            setUnreadCount(notificationsData.filter(n => !n.is_read).length);
        } catch (error) {
            console.error("Failed to fetch user data", error);
            setAuthError("Could not load your profile data.");
        }
    };

    useEffect(() => {
        // Mobile detection & vh fix
        const handleResize = () => {
            setIsMobile(window.innerWidth <= 800);
            document.documentElement.style.setProperty('--app-height', `${window.innerHeight}px`);
        };
        window.addEventListener('resize', handleResize);
        handleResize(); // Initial call to set values

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
                setNotifications([]);
                setUnreadCount(0);
            }
            
            // Once we have determined the auth state, we can hide the anitial loader.
            // Data will continue to populate in the background.
            setIsAuthLoading(false);
        });

        // Load Theme & Hint Count
        const savedTheme = localStorage.getItem('theme') as Theme;
        if (savedTheme) setTheme(savedTheme);
        setHintCount(getHintCount());

        return () => {
            authListener.subscription.unsubscribe();
            window.removeEventListener('resize', handleResize);
        }
    }, [getHintCount]);

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
    }, [theme]);

    const handleSignOut = async () => {
        await signOut();
        setPage('home'); // Redirect to home which will render AuthPage
    };

    const [isUpdating, setIsUpdating] = useState(false);
    const updateUserTrainingPhase = async (trainingPhase: TrainingPhase) => {
        if (!profile || !session?.user || isUpdating) return;
        setIsUpdating(true);
        try {
            const { error } = await supabase.auth.updateUser({
                data: { training_phase: trainingPhase }
            });
            if (error) throw error;
            // The onAuthStateChange listener will now handle the profile update seamlessly.
        } catch(error: any) {
            console.error("Failed to update training phase", error.message);
            // Optionally set an error state to show in UI
        } finally {
            setIsUpdating(false);
        }
    };

    const markNotificationAsRead = async (notificationId: number) => {
        if (!session?.user) return;
        // Optimistically update UI
        const originalNotifications = notifications;
        const originalCount = unreadCount;
        setNotifications(prev => prev.map(n => n.id === notificationId ? { ...n, is_read: true } : n));
        setUnreadCount(prev => Math.max(0, prev - 1));

        const success = await supabaseMarkNotificationAsRead(notificationId, session.user.id);
        if (!success) {
            // Revert on failure
            setNotifications(originalNotifications);
            setUnreadCount(originalCount);
        }
    };
    
    const markAllNotificationsAsRead = async () => {
        if (!session?.user || unreadCount === 0) return;
        // Optimistically update UI
        const originalNotifications = notifications;
        setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
        setUnreadCount(0);

        const success = await supabaseMarkAllNotificationsAsRead(session.user.id);
        if (!success) {
            // Revert on failure
            setNotifications(originalNotifications);
            setUnreadCount(originalNotifications.filter(n => !n.is_read).length);
        }
    };

    const loadPatientVideos = async (profile: DiagnosticCase['patientProfile']) => {
        try {
            // Use LLM to pick the best avatar. This returns a pair of guaranteed-to-match video IDs.
            const videoData = await pickBestVideo(profile);
            
            if (!videoData.idle || !videoData.talking) {
                console.warn("Video selection returned null IDs. Falling back to icon.", videoData);
                setPatientVideos({ idle: null, talking: null, gender: null });
            } else {
                 setPatientVideos(videoData);
            }
        } catch (error) {
            console.error("Error during video selection process, will fallback to icon.", error);
            setPatientVideos({ idle: null, talking: null, gender: null });
        }
    };

    const handleStartNewCase = useCallback((caseData: DiagnosticCase) => {
        if (!caseData?.title) {
            console.error("handleStartNewCase was called with invalid data.");
            return;
        }
        setCurrentCase(caseData);
        setSoapNote(null);
        setHintCount(getHintCount()); // Reset hint count for new case from storage
        setPage('simulation');
    }, [getHintCount]);
    
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

    const value = {
        session, profile, isAuthLoading, authError, setProfile, handleSignOut, updateUserTrainingPhase,
        page, setPage, homeTab, setHomeTab, theme, toggleTheme, isMobile, isMobileMenuOpen, setIsMobileMenuOpen,
        isGenerating, generationError, generationFilters, currentCase, handleStartNewCase, handleGenerateAndStart, handleRegenerateCase,
        soapNote, isGeneratingSoapNote, soapNoteError, handleGenerateSoapNote,
        hintCount, getHintCount, updateHintCount,
        patientVideos,
        notifications, unreadCount, markNotificationAsRead, markAllNotificationsAsRead
    };

    return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

// --- UI COMPONENTS ---

const NotificationIcon = ({ type }: { type: NotificationType }) => {
    switch (type) {
        case 'achievement': return <IconAward />;
        case 'new_feature': return <IconLightbulb />;
        default: return <IconMail />;
    }
};

const NotificationMenu = () => {
    const { 
        notifications, unreadCount, markNotificationAsRead, markAllNotificationsAsRead, 
        setPage, setHomeTab 
    } = useAppContext();
    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleNotificationClick = (notification: Notification) => {
        if (!notification.is_read) {
            markNotificationAsRead(notification.id);
        }
        
        if (notification.link) {
            if (notification.link.startsWith('#')) {
                const tab = notification.link.substring(1) as HomeTab;
                setPage('home');
                setHomeTab(tab);
                setIsOpen(false);
            } else {
                window.open(notification.link, '_blank');
            }
        }
    };
    
    return (
        <div className="notification-menu" ref={menuRef}>
            <button className="icon-button notification-bell-button" onClick={() => setIsOpen(!isOpen)} onKeyDown={(e) => e.key === 'Enter' && setIsOpen(!isOpen)} aria-haspopup="true" aria-expanded={isOpen} aria-label={`${unreadCount} unread notifications`}>
                <IconBell />
                {unreadCount > 0 && <span className="notification-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
            </button>
            <div className={`notification-dropdown ${isOpen ? 'open' : ''}`} role="menu">
                <div className="dropdown-header">
                    <h4>Notifications</h4>
                    {unreadCount > 0 && <button className="mark-all-read" onClick={markAllNotificationsAsRead}>Mark all as read</button>}
                </div>
                <div className="notification-list">
                    {notifications.length > 0 ? (
                        notifications.map(n => (
                            <div key={n.id} className={`notification-item ${!n.is_read ? 'unread' : ''}`} onClick={() => handleNotificationClick(n)} role="menuitem" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && handleNotificationClick(n)}>
                                <div className="notification-item-icon">
                                    <NotificationIcon type={n.type} />
                                </div>
                                <div className="notification-item-content">
                                    <strong>{n.title}</strong>
                                    <p>{n.message}</p>
                                    <span>{timeAgo(n.created_at)}</span>
                                </div>
                                {!n.is_read && <div className="unread-dot"></div>}
                            </div>
                        ))
                    ) : (
                        <div className="notification-empty">You have no new notifications.</div>
                    )}
                </div>
            </div>
        </div>
    );
};

const ProfileMenu = () => {
    const { profile, theme, toggleTheme, handleSignOut } = useAppContext();
    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

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

const MobileProfileMenu = ({ onClose }: { onClose: () => void }) => {
    const { profile, theme, toggleTheme, handleSignOut, setHomeTab } = useAppContext();

    if (!profile) return null;

    return (
        <div className="mobile-menu-overlay" onClick={onClose}>
            <div className="mobile-menu-content" onClick={(e) => e.stopPropagation()}>
                <div className="mobile-menu-header">
                    <h3>{profile.full_name || 'User'}</h3>
                    <p>{profile.email}</p>
                    <button className="close-button" onClick={onClose} aria-label="Close menu"><IconClose /></button>
                </div>
                <div className="mobile-menu-body">
                     <div className="mobile-menu-section">
                        <button className="mobile-menu-item" onClick={() => { toggleTheme(); onClose(); }}>
                            {theme === 'light' ? <IconMoon /> : <IconSun />}
                            <span>Switch to {theme === 'light' ? 'Dark' : 'Light'} Theme</span>
                        </button>
                        <button className="mobile-menu-item" onClick={() => { handleSignOut(); onClose(); }}>
                            <IconLogOut />
                            <span>Sign Out</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

const AppHeader = () => {
    const { session, setPage, isMobile, page, homeTab, setIsMobileMenuOpen, profile } = useAppContext();
    
    if (isMobile && page === 'home' && (homeTab === 'case')) {
        return null;
    }

    if (isMobile && page === 'home') {
        if (homeTab === 'home') {
            return (
                <header className="app-header mobile-home-header">
                    <button className="icon-button" onClick={() => setIsMobileMenuOpen(true)} aria-label="Open menu">
                        <IconMenu />
                    </button>
                    <div className="welcome-message">
                        <h2>Hi, Dr. {profile?.full_name?.split(' ')[0] || 'User'}</h2>
                        <p>Your patients are lined up, let's get started</p>
                    </div>
                    <NotificationMenu />
                </header>
            );
        }
        
        let title = "Profile"; // Fallback, though menu opens
        
        return (
            <header className="app-header mobile-generic-header">
                <button className="icon-button" onClick={() => setIsMobileMenuOpen(true)} aria-label="Open menu">
                    <IconMenu />
                </button>
                <h1 className="app-header-title">{title}</h1>
                <NotificationMenu />
            </header>
        );
    }
    
    // Default Desktop / Simulation Page Header
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
                {session && !isMobile && <button className="button button-outline home-button-header" onClick={() => setPage('home')}><IconHome/> <span>Home</span></button>}
                {session && <NotificationMenu />}
                {session && !isMobile && <ProfileMenu />}
                {session && isMobile && (
                    <button className="icon-button" onClick={() => setIsMobileMenuOpen(true)} aria-label="Open menu">
                        <IconMenu />
                    </button>
                )}
                 {!session && <div/>}
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
    const [showSignupSuccess, setShowSignupSuccess] = useState(false);

    const handleCloseSignupModal = () => {
        setShowSignupSuccess(false);
        setIsLogin(true); // Switch to login view
        setEmail('');
        setPassword('');
        setFullName('');
    };

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
                setShowSignupSuccess(true);
            }
        } catch (err: any) {
            setError(err.message || 'An unexpected error occurred.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <main className="app-container auth-page-wrapper">
            {showSignupSuccess && (
                <ExplanationModal
                    title="Check Your Email"
                    icon={<IconMail />}
                    iconType="info"
                    showOkButton={true}
                    onClose={handleCloseSignupModal}
                >
                    A confirmation link has been sent to your email address. Please check your inbox and click the link to verify your account.
                </ExplanationModal>
            )}
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

const FilterSidebar = ({ filters, onFilterChange, hideTitle = false, className = '' }: {
    filters: Partial<GenerationFilters>,
    onFilterChange: React.Dispatch<React.SetStateAction<Partial<GenerationFilters>>>,
    hideTitle?: boolean,
    className?: string
}) => {
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
        <aside className={`filter-sidebar ${className}`}>
            {!hideTitle && <h2>Filter Your Case</h2>}
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
                    "You will be seeing a random patient based on your profile. Use the filters to customize."
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
    'Para-clinical': { icon: IconSettings, description: "Bridge theory with pathology, pharmacology, and microbiology." },
    'Clinical': { icon: IconStethoscope, description: "Gain hands-on experience in wards and patient care." },
    'Internship': { icon: IconBriefcase, description: "Apply your skills in a supervised professional setting." },
    'NExT/FMGE Prep': { icon: IconGraduationCap, description: "Focus on high-yield topics for your licensing exams." },
};

const TrainingPhaseSelector = () => {
    const { profile, updateUserTrainingPhase } = useAppContext();
    const [isUpdating, setIsUpdating] = useState<TrainingPhase | null>(null);

    const handleSelectPhase = async (phase: TrainingPhase) => {
        if (isUpdating !== null) return; // Prevent multiple clicks while an update is in progress
        setIsUpdating(phase);
        await updateUserTrainingPhase(phase);
        setIsUpdating(null);
    };

    return (
        <div className="training-phase-list">
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
                    </button>
                );
            })}
        </div>
    );
};


const SelectionList = ({ items, selectedItems, onSelect }: { items: { id: string, label: string, icon: React.FC }[], selectedItems: string[], onSelect: (id: string) => void }) => {
    return (
        <div className="selection-list">
            {items.map(item => {
                const isSelected = selectedItems.includes(item.id);
                const Icon = item.icon;
                return (
                    <button key={item.id} className={`selection-item ${isSelected ? 'selected' : ''}`} onClick={() => onSelect(item.id)}>
                        <div className="selection-item-icon"><Icon /></div>
                        <span className="selection-item-label">{item.label}</span>
                    </button>
                );
            })}
        </div>
    );
};

const NewCaseTab = () => {
    const { profile, handleGenerateAndStart, isGenerating, generationError, isMobile, setHomeTab } = useAppContext();
    const [filters, setFilters] = useState<Partial<GenerationFilters>>({
        trainingPhase: profile?.training_phase || undefined,
        specialties: [],
        epas: [],
        challengeMode: false,
    });
    const [simSetupTab, setSimSetupTab] = useState<'Phase' | 'Specialty' | 'EPA'>('Phase');

    useEffect(() => {
        if (profile?.training_phase) {
            setFilters(prev => ({ ...prev, trainingPhase: profile.training_phase as TrainingPhase }));
        }
    }, [profile]);

    const handleMultiSelectChange = (filterKey: 'specialties' | 'epas', value: string) => {
        setFilters(prev => {
            const currentValues = (prev[filterKey] as string[]) || [];
            const newValues = currentValues.includes(value)
                ? currentValues.filter(v => v !== value)
                : [...currentValues, value];
            return { ...prev, [filterKey]: newValues };
        });
    };

    const specialtyItems = [
        { id: 'Internal Medicine', label: 'Internal Medicine', icon: IconStethoscope },
        { id: 'Pediatrics', label: 'Pediatrics', icon: IconBottle },
        { id: 'Surgery', label: 'Surgery', icon: IconScalpel },
        { id: 'Obstetrics & Gynecology', label: 'Obstetrics & Gynecology', icon: IconBaby },
        { id: 'Psychiatry', label: 'Psychiatry', icon: IconBrain },
        { id: 'Cardiology', label: 'Cardiology', icon: IconHeart },
        { id: 'Neurology', label: 'Neurology', icon: IconSparkles },
        { id: 'Dermatology', label: 'Dermatology', icon: IconHandPlaster },
        { id: 'Emergency Medicine', label: 'Emergency Medicine', icon: IconActivity },
    ];

    const epaItems = [
        { id: 'History-taking', label: 'History Taking', icon: IconFileText },
        { id: 'Physical Exam', label: 'Physical Exam', icon: IconStethoscope },
        { id: 'Diagnosis', label: 'Diagnosis', icon: IconSearch },
        { id: 'Management', label: 'Management', icon: IconUsers },
    ];
    
    const handleGenerateClick = () => {
        if (!profile || !profile.training_phase) return;
        handleGenerateAndStart({
            trainingPhase: profile.training_phase as TrainingPhase,
            specialties: filters.specialties,
            epas: filters.epas,
            challengeMode: filters.challengeMode,
        });
    };

    if (isMobile) {
        const handleNextStep = () => {
            if (simSetupTab === 'Phase') {
                if (profile?.training_phase) {
                    setSimSetupTab('Specialty');
                }
            } else if (simSetupTab === 'Specialty') {
                setSimSetupTab('EPA');
            } else if (simSetupTab === 'EPA') {
                handleGenerateClick();
            }
        };

        const handleBackStep = () => {
            if (simSetupTab === 'EPA') {
                setSimSetupTab('Specialty');
            } else if (simSetupTab === 'Specialty') {
                setSimSetupTab('Phase');
            } else { // 'Phase'
                setHomeTab('home');
            }
        };

        return (
            <div className="new-case-tab-mobile">
                 <header className="app-header mobile-generic-header standalone">
                    <button className="icon-button" onClick={handleBackStep}><IconChevronLeft /></button>
                    <h1 className="app-header-title">Simulation</h1>
                    <div style={{width: 40}}></div>
                </header>
                
                <div className="mobile-tab-content">
                    {simSetupTab === 'Phase' && (
                         <div className="training-phase-section mobile">
                            <h2>Select Your Training Phase</h2>
                            <p>This tailors case difficulty and is saved to your profile for future sessions.</p>
                            <TrainingPhaseSelector />
                        </div>
                    )}
                    {simSetupTab === 'Specialty' && (
                        <div className="specialty-section mobile">
                            <h2>Choose your Specialty</h2>
                            <SelectionList items={specialtyItems} selectedItems={filters.specialties || []} onSelect={(id) => handleMultiSelectChange('specialties', id)} />
                        </div>
                    )}
                    {simSetupTab === 'EPA' && (
                         <div className="specialty-section mobile epa-section">
                            <h2>EPA Focus</h2>
                            <SelectionList items={epaItems} selectedItems={filters.epas || []} onSelect={(id) => handleMultiSelectChange('epas', id)} />

                            <div className="challenge-mode-mobile">
                                <div className="challenge-mode-text">
                                    <h3>Challenge mode</h3>
                                    <p>Generates complex, interdisciplinary cases</p>
                                </div>
                                <label className="switch">
                                    <input type="checkbox" checked={filters.challengeMode} onChange={e => setFilters(p => ({...p, challengeMode: e.target.checked}))} />
                                    <span className="slider"></span>
                                </label>
                            </div>
                        </div>
                    )}
                </div>

                <div className="mobile-start-button-container">
                    <button
                        className="button button-primary generate-button"
                        onClick={handleNextStep}
                        disabled={isGenerating || !profile?.training_phase}
                        title={!profile?.training_phase ? "Please select a training phase first" : "Start a new case"}
                    >
                        {isGenerating ? <div className="loading-spinner"></div> : (simSetupTab === 'EPA' ? "Generate Case" : "Next")}
                    </button>
                     {!profile?.training_phase && simSetupTab === 'Phase' && <p className="alert alert-inline">Please select a training phase to start.</p>}
                    {generationError && <p className="alert alert-error">{generationError}</p>}
                </div>
            </div>
        );
    }

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
                    
                    <CustomCaseSummary filters={filters} onRemoveFilter={(key, val) => handleMultiSelectChange(key, val)} />

                    <button
                        className="button button-primary generate-button"
                        onClick={handleGenerateClick}
                        disabled={isGenerating || !profile?.training_phase}
                        title={!profile?.training_phase ? "Please select a training phase first" : "Start a new case"}
                    >
                        {isGenerating ? <div className="loading-spinner"></div> : "Chat with Patient"}
                    </button>
                    {!profile?.training_phase && <p className="alert alert-inline">Please select a training phase to start.</p>}
                    {generationError && <p className="alert alert-error">{generationError}</p>}
                </div>
            </div>
        </div>
    );
};

const BottomNavBar = () => {
    const { homeTab, setHomeTab, setIsMobileMenuOpen } = useAppContext();

    const TABS: { id: HomeTab; icon: React.FC<{className?: string, isActive?: boolean}>; label: string }[] = [
        { id: 'home', icon: IconHome, label: 'Home' },
        { id: 'case', icon: IconDashboard, label: 'Case' },
        { id: 'profile', icon: IconUser, label: 'Profile' },
    ];
    
    const handleNavClick = (tabId: HomeTab) => {
        if (tabId === 'profile') {
            setIsMobileMenuOpen(true);
        } else {
            setHomeTab(tabId);
        }
    }

    return (
        <div className="bottom-nav-bar">
            <nav>
                {TABS.map(tab => {
                    const Icon = tab.icon;
                    const isActive = homeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            className={`nav-item ${isActive ? 'active' : ''}`}
                            onClick={() => handleNavClick(tab.id)}
                            aria-label={tab.label}
                            aria-current={isActive ? 'page' : undefined}
                        >
                            <Icon className="nav-icon" isActive={isActive}/>
                            <span className="nav-label">{tab.label}</span>
                        </button>
                    )
                })}
            </nav>
        </div>
    )
}

const PromoBanner = () => (
    <div className="promo-banner">
        <IconGift />
        <div className="promo-banner-text">
            <strong>Get Free access for 1 month</strong>
            <span>Valid till 31st August.</span>
        </div>
    </div>
);

const StartSimCard = ({ onStart }: { onStart: () => void }) => (
    <div className="start-sim-card">
        <h2>Talk to your Virtual Patient</h2>
        <p>Simulate Real Interviews. Diagnose in Real Time.</p>
        <button onClick={onStart} aria-label="Start Now">
            <IconArrowRight />
        </button>
    </div>
);

const AivanaFooter = () => (
    <div className="aivana-footer">
        from <strong>Aivana</strong>
    </div>
);

const HomePage = () => {
    const { profile, homeTab, setHomeTab, isMobile } = useAppContext();

    const renderMobileContent = () => {
        switch(homeTab) {
            case 'case': return <NewCaseTab />;
            case 'home':
            default:
                return (
                    <div className="home-dashboard">
                        <PromoBanner />
                        <StartSimCard onStart={() => setHomeTab('case')} />
                        <AivanaFooter />
                    </div>
                );
        }
    }

    if (isMobile) {
        return (
            <main className="app-container home-page mobile-view">
                <div className="home-content-mobile">
                    {renderMobileContent()}
                </div>
                <BottomNavBar />
            </main>
        )
    }

    return (
        <main className="app-container home-page desktop-view">
            <div className="home-header">
                <h1>Welcome back, {profile?.full_name?.split(' ')[0] || 'Doctor'}!</h1>
                <p>Your patient just walked in. Time to begin diagnosis.</p>
            </div>
            
            <div className="home-page-layout">
                <div className="home-page-main">
                    <div className="home-content">
                       <NewCaseTab />
                    </div>
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

const ExplanationModal = ({ title, children, icon, iconType = 'info', onClose, showOkButton = false }: { title: string, children: ReactNode, icon?: ReactNode, iconType?: 'success' | 'info' | 'danger', onClose: () => void, showOkButton?: boolean }) => {
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [onClose]);

    return (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="modal-title" onClick={onClose}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h2 id="modal-title">{title}</h2>
                    <button className="close-button" onClick={onClose} aria-label="Close">
                        <IconClose />
                    </button>
                </div>
                <div className="modal-body">
                    {icon && <div className={`modal-icon-wrapper modal-icon-${iconType}`}>{icon}</div>}
                    <div style={{ whiteSpace: 'pre-wrap', textAlign: icon ? 'center' : 'left' }}>{children}</div>
                </div>
                {showOkButton && (
                    <div className="modal-footer">
                        <button className="button button-primary" onClick={onClose}>OK</button>
                    </div>
                )}
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

    const { potentialDiagnoses, correctDiagnosisExplanation } = currentCase;
    const isRevealed = !!selectedDiagnosis;

    return (
        <div className="panel actions-panel">
            <div className="panel-header">
                <h3>Potential Diagnoses</h3>
                <p>Select what you believe is the correct diagnosis.</p>
            </div>
            <div className="panel-content">
                <div className="choice-options">
                    {potentialDiagnoses.map(({ diagnosis, isCorrect }) => {
                        const isSelected = selectedDiagnosis === diagnosis;
                        return (
                            <button key={diagnosis}
                                className={`choice-option ${isRevealed && isCorrect ? 'correct' : ''} ${isRevealed && isSelected && !isCorrect ? 'incorrect' : ''}`}
                                onClick={() => onSelectDiagnosis(diagnosis)} disabled={isRevealed}>
                                {isRevealed && (isCorrect || isSelected) && (isCorrect ? <IconCheck/> : <IconX className="choice-option-icon"/>)}
                                {diagnosis}
                            </button>
                        );
                    })}
                </div>
                {isRevealed && correctDiagnosisExplanation && (
                    <div className="explanation-box">
                        <h4>Explanation</h4>
                        <p>{correctDiagnosisExplanation}</p>
                    </div>
                )}
            </div>
        </div>
    );
};

const QuestionsPanel = ({
    selectedDiagnosis,
    selectedMcqAnswers,
    onSelectMcqAnswer,
    onFinishCase,
    isFinishing
}: {
    selectedDiagnosis: string | null;
    selectedMcqAnswers: Record<number, number>;
    onSelectMcqAnswer: (mcqIndex: number, optionIndex: number) => void;
    onFinishCase: () => void;
    isFinishing: boolean;
}) => {
    const {
        currentCase,
        soapNote, isGeneratingSoapNote, soapNoteError, handleGenerateSoapNote
    } = useAppContext();

    if (!currentCase) return <div className="panel actions-panel"><p>Loading...</p></div>;

    const allMcqsAnswered = currentCase.mcqs.length > 0 && Object.keys(selectedMcqAnswers).length === currentCase.mcqs.length;
    const canFinish = allMcqsAnswered || currentCase.mcqs.length === 0;

    return (
        <div className="panel actions-panel">
             <div className="panel-header">
                <h3>Clinical Questions</h3>
            </div>
            <div className="panel-content">
                {!selectedDiagnosis ? (
                    <div className="info-box">Please select a diagnosis first to unlock the clinical questions.</div>
                ) : (
                    <>
                        <AccordionSection title="Questions" defaultOpen={true}>
                            {currentCase.mcqs.length > 0 ? currentCase.mcqs.map((mcq, index) => {
                                const isRevealed = selectedMcqAnswers[index] !== undefined;
                                return(
                                <div key={index} className="mcq-item">
                                    <p><strong>{index + 1}. {mcq.question}</strong></p>
                                    <div className="choice-options">
                                        {mcq.options.map((option, optionIndex) => {
                                            const isSelected = selectedMcqAnswers[index] === optionIndex;
                                            const isCorrect = mcq.correctAnswerIndex === optionIndex;
                                            return (
                                                <button key={optionIndex}
                                                    className={`choice-option ${isRevealed && isCorrect ? 'correct' : ''} ${isRevealed && isSelected && !isCorrect ? 'incorrect' : ''}`}
                                                    onClick={() => onSelectMcqAnswer(index, optionIndex)} disabled={isRevealed}>
                                                    {isRevealed && (isCorrect || isSelected) && (isCorrect ? <IconCheck/> : <IconX className="choice-option-icon"/>)}
                                                    {option}
                                                </button>
                                            );
                                        })}
                                    </div>
                                    {isRevealed && (
                                        <div className="explanation-box">
                                            <h4>Explanation</h4>
                                            <p>{mcq.explanation}</p>
                                        </div>
                                    )}
                                </div>
                            )}) : <p>No clinical questions for this case.</p>}
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

                        {canFinish && (
                           <div className="finish-case-action">
                             <button className="button button-primary" onClick={onFinishCase} disabled={isFinishing}>
                               {isFinishing && <div className="loading-spinner"></div>}
                               Finish Case
                             </button>
                           </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

const MobileCaseInfoView = ({ currentCase }: { currentCase: DiagnosticCase }) => {
    if (!currentCase) return null;
    return (
        <div className="case-info-mobile-view">
            <h2 className="case-title-mobile">{currentCase.title}</h2>
            <p className="case-subtitle">{currentCase.patientProfile.name}, {currentCase.patientProfile.age}, {currentCase.patientProfile.gender}</p>
            <CaseTagsDisplay tags={currentCase.tags} />
            
            <h3 className="mobile-case-info-heading">Chief Complaint</h3>
            <p className="chief-complaint-text">"{currentCase.chiefComplaint}"</p>
            
            <h3 className="mobile-case-info-heading">History of Present Illness</h3>
            <p>{currentCase.historyOfPresentIllness}</p>
            
            <h3 className="mobile-case-info-heading">Physical Exam</h3>
            <p style={{ whiteSpace: 'pre-wrap' }}>{currentCase.physicalExam}</p>
            
            <h3 className="mobile-case-info-heading">Lab Results</h3>
            <p style={{ whiteSpace: 'pre-wrap' }}>{currentCase.labResults}</p>
        </div>
    );
};

const SimulationHeaderMobile = ({
    activeTab, onTabClick, onBack, onRequestHint, hintCount, isGeneratingHint
}: {
    activeTab: ActiveTab;
    onTabClick: (tab: ActiveTab) => void;
    onBack: () => void;
    onRequestHint: () => void;
    hintCount: number;
    isGeneratingHint: boolean;
}) => {
    const TABS: ActiveTab[] = useMemo(() => ['case', 'chat', 'diagnosis', 'questions'], []);

    return (
        <header className="simulation-header-mobile">
            <button onClick={onBack} className="back-button" aria-label="Go back">
                <IconChevronLeft />
            </button>
            <div className="sim-tabs-container">
                 {TABS.map(tab => (
                    <button 
                        key={tab} 
                        className={`sim-tab-button ${activeTab === tab ? 'active' : ''}`} 
                        onClick={() => onTabClick(tab)}
                    >
                        {tab.charAt(0).toUpperCase() + tab.slice(1)}
                    </button>
                ))}
            </div>
             <div className="header-spacer">
                <button 
                    className="icon-button mobile-hint-button" 
                    onClick={onRequestHint} 
                    disabled={isGeneratingHint || hintCount <= 0}
                    aria-label="Get a hint"
                >
                    <IconLightbulb/>
                    {hintCount > 0 && <span className="mobile-hint-badge">{hintCount}</span>}
                </button>
             </div>
        </header>
    )
};


const ChatWindow = ({
    chat,
    messages,
    setMessages,
    setLatestPatientMessage,
    onRequestHint,
    isGeneratingHint
}: {
    chat: Chat | null;
    messages: ChatMessage[];
    setMessages: (messages: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
    setLatestPatientMessage: (message: string | null) => void;
    onRequestHint?: () => void;
    isGeneratingHint?: boolean;
}) => {
    const [userInput, setUserInput] = useState('');
    const [isResponding, setIsResponding] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const { hintCount, isMobile } = useAppContext();

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(scrollToBottom, [messages]);

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!userInput.trim() || !chat || isResponding) return;

        const userMessage: ChatMessage = {
            sender: 'user',
            text: userInput,
            timestamp: new Date().toISOString()
        };
        
        const patientThinkingMessage: ChatMessage = {
            sender: 'patient',
            text: 'Thinking...',
            timestamp: new Date().toISOString()
        };

        setMessages(prev => [...prev, userMessage, patientThinkingMessage]);
        setUserInput('');
        setIsResponding(true);

        try {
            const response = await chat.sendMessage({ message: userInput });
            const patientResponseText = response.text;

            const patientMessage: ChatMessage = {
                sender: 'patient',
                text: patientResponseText,
                timestamp: new Date().toISOString()
            };

            setMessages(prev => [...prev.slice(0, -1), patientMessage]);
            setLatestPatientMessage(patientResponseText);

        } catch (error) {
            console.error("Error sending message:", error);
            const errorMessage: ChatMessage = {
                sender: 'system',
                text: "Sorry, I'm having trouble responding right now. Please try again.",
                timestamp: new Date().toISOString()
            };
            setMessages(prev => [...prev.slice(0, -1), errorMessage]);
        } finally {
            setIsResponding(false);
        }
    };

    return (
        <div className="panel chat-panel">
            <div className="panel-header">
                <h3>Chat with Patient</h3>
                {!isMobile && onRequestHint && isGeneratingHint !== undefined && (
                    <button className="button button-outline hint-button" onClick={onRequestHint} disabled={isGeneratingHint || hintCount <= 0}>
                        <IconLightbulb/>
                        <span>Hint ({hintCount})</span>
                        {isGeneratingHint && <div className="loading-spinner-inline"></div>}
                    </button>
                )}
            </div>
            <div className="panel-content">
                <div className="chat-window">
                    {messages.filter(msg => msg.sender !== 'patient').map((msg, index) => (
                        <div key={index} className={`chat-message ${msg.sender}`}>
                            <div className="message-bubble">{msg.text}</div>
                        </div>
                    ))}
                    <div ref={messagesEndRef} />
                </div>
                <form className="chat-input-form" onSubmit={handleSendMessage}>
                    <input
                        type="text"
                        className="chat-input"
                        placeholder="Ask a question..."
                        value={userInput}
                        onChange={(e) => setUserInput(e.target.value)}
                        disabled={isResponding}
                        aria-label="Your message"
                    />
                    <button type="submit" className="send-button" disabled={isResponding || !userInput.trim()} aria-label="Send message">
                       {isResponding ? <div className="loading-spinner"></div> : <IconSend/>}
                    </button>
                </form>
            </div>
        </div>
    );
};

const SimulationPage = () => {
    const { 
        currentCase, isMobile, setPage, 
        hintCount, updateHintCount 
    } = useAppContext();
    
    // Interaction State
    const [selectedDiagnosis, setSelectedDiagnosis] = useState<string | null>(null);
    const [selectedMcqAnswers, setSelectedMcqAnswers] = useState<Record<number, number>>({});
    const [activeTab, setActiveTab] = useState<ActiveTab>('chat');
    const [isFinishing, setIsFinishing] = useState(false);
    const [latestPatientMessage, setLatestPatientMessage] = useState<string | null>(null);

    // Chat State
    const [chat, setChat] = useState<Chat | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [isGeneratingHint, setIsGeneratingHint] = useState(false);
    const messagesRef = useRef(messages);
    messagesRef.current = messages;

    // Load chat state from localStorage and initialize chat instance
    useEffect(() => {
        if (!currentCase) return;

        // Reset all state for new case
        setSelectedDiagnosis(null);
        setSelectedMcqAnswers({});
        setActiveTab('chat');
        setIsFinishing(false);
        setLatestPatientMessage(null);
        setIsGeneratingHint(false);

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
        
        const chatInstance = createChatForCase(currentCase);
        setChat(chatInstance);

        // Save history on unmount
        return () => {
            if (messagesRef.current.length > 0) {
                localStorage.setItem(chatHistoryKey, JSON.stringify(messagesRef.current));
            } else {
                localStorage.removeItem(chatHistoryKey);
            }
        };
    }, [currentCase]);


    const handleSelectDiagnosis = (diagnosis: string) => {
        if (!selectedDiagnosis && currentCase) {
            setSelectedDiagnosis(diagnosis);
            // On mobile and desktop, auto-switch to the questions tab after diagnosis
            setActiveTab('questions');
        }
    };

    const handleSelectMcqAnswer = (mcqIndex: number, optionIndex: number) => {
        if (selectedMcqAnswers[mcqIndex] === undefined && currentCase) {
            setSelectedMcqAnswers(prev => ({ ...prev, [mcqIndex]: optionIndex }));
        }
    };

    const handleRequestHint = async () => {
        if (!currentCase || hintCount <= 0 || isGeneratingHint) return;
        setIsGeneratingHint(true);
        try {
            const newHint = await generateHint(currentCase, messages);
            const hintMessage: ChatMessage = {
                sender: 'system',
                text: newHint,
                timestamp: new Date().toISOString()
            };
            setMessages(prev => [...prev, hintMessage]);
            updateHintCount(hintCount - 1);
        } catch (error) {
            console.error("Hint generation failed:", error);
            const errorText = `Sorry, I couldn't generate a hint right now. Please try again.`;
            const errorMessage: ChatMessage = {
                sender: 'system', text: errorText, timestamp: new Date().toISOString()
            };
            setMessages(prev => [...prev, errorMessage]);
        } finally {
            setIsGeneratingHint(false);
        }
    };

    const handleFinishCase = async () => {
        if (!currentCase) return;
        setIsFinishing(true);

        try {
            // Clear history for this case from local storage
            const chatHistoryKey = `chatHistory_${currentCase.title}`;
            localStorage.removeItem(chatHistoryKey);
        } catch(error) {
            console.error("Error during case finishing:", error);
            // Optionally, show an error to the user
        } finally {
            setIsFinishing(false);
            setPage('home'); // Just return to home page
        }
    };

    if (!currentCase) return null;

    // --- RENDER LOGIC ---
    if (isMobile) {
        return (
            <main className={`app-container simulation-page mobile-view tab-${activeTab}`}>
                {activeTab === 'chat' && <PatientVisualizer latestPatientMessage={latestPatientMessage} />}
                
                <SimulationHeaderMobile 
                    activeTab={activeTab} 
                    onTabClick={setActiveTab} 
                    onBack={() => setPage('home')}
                    onRequestHint={handleRequestHint}
                    hintCount={hintCount}
                    isGeneratingHint={isGeneratingHint}
                />
                
                {activeTab === 'chat' && (
                    <ChatWindow 
                        chat={chat}
                        messages={messages}
                        setMessages={setMessages}
                        setLatestPatientMessage={setLatestPatientMessage}
                    />
                )}

                <div className="simulation-content-mobile">
                    {activeTab === 'case' && <MobileCaseInfoView currentCase={currentCase} />}
                    {activeTab === 'diagnosis' && 
                        <DiagnosisPanel 
                            selectedDiagnosis={selectedDiagnosis}
                            onSelectDiagnosis={handleSelectDiagnosis}
                        />
                    }
                    {activeTab === 'questions' && 
                        <QuestionsPanel
                            selectedDiagnosis={selectedDiagnosis}
                            selectedMcqAnswers={selectedMcqAnswers}
                            onSelectMcqAnswer={handleSelectMcqAnswer}
                            onFinishCase={handleFinishCase}
                            isFinishing={isFinishing}
                        />
                    }
                </div>
            </main>
        );
    }
    
    // --- DESKTOP RENDER ---
    return (
        <main className="app-container simulation-page desktop-view">
            <CaseInfoPanel currentCase={currentCase} />
            <div className="central-panel">
                <PatientVisualizer latestPatientMessage={latestPatientMessage} />
            </div>
            <div className="right-panel">
                <div className="tab-nav">
                    <button className={`tab-nav-button ${activeTab === 'chat' ? 'active' : ''}`} onClick={() => setActiveTab('chat')}>Chat</button>
                    <button className={`tab-nav-button ${activeTab === 'diagnosis' ? 'active' : ''}`} onClick={() => setActiveTab('diagnosis')}>Diagnosis</button>
                    <button className={`tab-nav-button ${activeTab === 'questions' ? 'active' : ''}`} onClick={() => setActiveTab('questions')}>Questions</button>
                </div>

                {activeTab === 'chat' && (
                    <ChatWindow 
                        chat={chat}
                        messages={messages}
                        setMessages={setMessages}
                        setLatestPatientMessage={setLatestPatientMessage}
                        onRequestHint={handleRequestHint}
                        isGeneratingHint={isGeneratingHint}
                    />
                )}
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
                        onFinishCase={handleFinishCase}
                        isFinishing={isFinishing}
                    />
                )}
            </div>
        </main>
    );
};


const PatientVisualizer = ({ latestPatientMessage }: { latestPatientMessage: string | null }) => {
    const { currentCase, patientVideos } = useAppContext();
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [displayedMessage, setDisplayedMessage] = useState<string | null>(null);
    const [playersReady, setPlayersReady] = useState({ idle: false, talking: false });
    const idlePlayerRef = useRef<HTMLIFrameElement>(null);
    const talkingPlayerRef = useRef<HTMLIFrameElement>(null);
    const audioRef = useRef<HTMLAudioElement>(null);

    const ELEVENLABS_API_KEY = "sk_534b7d31eca335c36de4403f34172517d3a46117adcedd64";

    const getElevenLabsAudio = async (text: string, gender: 'Male' | 'Female' | null): Promise<string | null> => {
        if (!text) return null;
        
        const femaleVoiceId = '21m00Tcm4TlvDq8ikWAM'; // Rachel
        const maleVoiceId = 'pNInz6obpgDQGcFmaJgB';   // Adam
        
        const voiceId = gender === 'Male' ? maleVoiceId : femaleVoiceId;
        const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;
        
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Accept': 'audio/mpeg',
                    'Content-Type': 'application/json',
                    'xi-api-key': ELEVENLABS_API_KEY,
                },
                body: JSON.stringify({
                    text: text,
                    model_id: 'eleven_monolingual_v1',
                    voice_settings: { stability: 0.5, similarity_boost: 0.5 },
                }),
            });

            if (!response.ok) {
                console.error('ElevenLabs API error:', response.statusText);
                return null;
            }

            const audioBlob = await response.blob();
            return URL.createObjectURL(audioBlob);
        } catch (error) {
            console.error('Error fetching TTS from ElevenLabs:', error);
            return null;
        }
    };

    useEffect(() => {
        setDisplayedMessage(latestPatientMessage);
    }, [latestPatientMessage]);

    // Listen for player events from the iframes
    useEffect(() => {
        const handlePlayerMessage = (event: MessageEvent) => {
            if (event.origin !== 'https://play.gumlet.io') return;
            try {
                const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
                if (data && data.event === 'ready') {
                    if (event.source === idlePlayerRef.current?.contentWindow) {
                        setPlayersReady(prev => ({ ...prev, idle: true }));
                    } else if (event.source === talkingPlayerRef.current?.contentWindow) {
                        setPlayersReady(prev => ({ ...prev, talking: true }));
                    }
                }
            } catch (e) { /* Ignore non-JSON messages */ }
        };

        window.addEventListener('message', handlePlayerMessage);
        return () => window.removeEventListener('message', handlePlayerMessage);
    }, []);

    // Reset ready state when the case/videos change.
    useEffect(() => {
        if (patientVideos.idle && patientVideos.talking) {
            setPlayersReady({ idle: false, talking: false });
        }
    }, [patientVideos]);

    // Control speaking state and TTS playback with ElevenLabs
    useEffect(() => {
        let audioUrl: string | null = null;
        let isMounted = true;

        const playAudio = async () => {
            if (displayedMessage && playersReady.idle && playersReady.talking) {
                audioUrl = await getElevenLabsAudio(displayedMessage, patientVideos.gender);
                if (isMounted && audioRef.current && audioUrl) {
                    audioRef.current.src = audioUrl;
                    audioRef.current.play().catch(e => console.error("Audio play failed:", e));
                }
            }
        };
        
        playAudio();

        return () => {
            isMounted = false;
            if (audioUrl) {
                URL.revokeObjectURL(audioUrl);
            }
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current.src = '';
            }
        };
    }, [displayedMessage, playersReady, patientVideos.gender]);
    
    // If we have videos, render the players, otherwise show the fallback icon.
    if (!patientVideos.idle || !patientVideos.talking) {
        return (
            <div className="patient-visualizer">
                <div className="patient-icon-fallback">
                    <IconPatient />
                    <p>{currentCase?.patientProfile.name || "Patient"}</p>
                </div>
                 {displayedMessage && (
                    <p className="patient-subtitle-overlay" role="status">
                        {displayedMessage}
                    </p>
                )}
            </div>
        );
    }
    
    return (
        <div className="patient-visualizer">
            <div className={`patient-icon-fallback ${patientVideos.idle && playersReady.idle ? 'hidden' : ''}`}>
                <IconPatient />
                <p>Loading Patient Avatar...</p>
            </div>
            <iframe
                ref={idlePlayerRef}
                src={`https://play.gumlet.io/embed/${patientVideos.idle}?loop=1&autoplay=1&mute=1&disable_hotkeys=1&disable_ui=all`}
                title="Idle Patient Video"
                className={`patient-video ${isSpeaking ? 'hidden' : ''} ${!playersReady.idle ? 'hidden' : ''}`}
                allow="autoplay; fullscreen"
            ></iframe>
            <iframe
                ref={talkingPlayerRef}
                src={`https://play.gumlet.io/embed/${patientVideos.talking}?loop=1&autoplay=1&mute=1&disable_hotkeys=1&disable_ui=all`}
                title="Talking Patient Video"
                className={`patient-video ${!isSpeaking ? 'hidden' : ''} ${!playersReady.talking ? 'hidden' : ''}`}
                allow="autoplay; fullscreen"
            ></iframe>
            <audio
                ref={audioRef}
                onPlay={() => setIsSpeaking(true)}
                onEnded={() => setIsSpeaking(false)}
                onError={() => {
                    console.error("Audio playback error.");
                    setIsSpeaking(false);
                }}
                hidden
            />
            {displayedMessage && (
                <p className="patient-subtitle-overlay" role="status">
                    {displayedMessage}
                </p>
            )}
        </div>
    );
};

const App = () => {
    const { session, page, isGenerating, generationError, isAuthLoading, authError, isMobileMenuOpen, setIsMobileMenuOpen } = useAppContext();

    if (isAuthLoading) {
        return (
             <div className="splash-overlay">
                <div className="splash-content">
                    <div className="loading-spinner"></div>
                    <h2>MedAnna</h2>
                    <p>Loading your session...</p>
                </div>
            </div>
        );
    }

    if (authError) {
         return (
             <div className="splash-overlay">
                <div className="splash-content">
                    <IconAlertTriangle className="alert-icon"/>
                    <h2>Error</h2>
                    <p>{authError}</p>
                    <button className="button" onClick={() => window.location.reload()}>Try Again</button>
                </div>
            </div>
        );
    }

    return (
        <>
            <AppHeader />

            {session ? (
                page === 'home' ? <HomePage /> : <SimulationPage />
            ) : (
                <AuthPage />
            )}

            {isGenerating && <GeneratingCaseSplash />}

            {generationError && (
                 <ExplanationModal title="Generation Error" onClose={() => { /* This should be handled in context */ }} icon={<IconAlertTriangle/>}>
                    {generationError}
                 </ExplanationModal>
            )}
            
            {isMobileMenuOpen && <MobileProfileMenu onClose={() => setIsMobileMenuOpen(false)} />}
        </>
    );
};

const root = createRoot(document.getElementById('root')!);
root.render(
    <StrictMode>
        <AppContextProvider>
            <App />
        </AppContextProvider>
    </StrictMode>
);