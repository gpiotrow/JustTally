export type Role = 'admin' | 'user';
export type Difficulty = 'beginner' | 'intermediate' | 'advanced';
export type MediaType = 'image' | 'video';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  createdAt?: number;
}

export interface Media {
  id: string;
  mediaType: MediaType;
  url: string;
  thumbnailUrl: string | null;
  originalName: string | null;
}

export interface Exercise {
  id: string;
  /** German-preferred resolved name (server-side fallback). */
  name: string;
  /** German-preferred resolved instructions (server-side fallback). */
  instructions: string;
  nameDe: string;
  nameEn: string;
  instructionsDe: string;
  instructionsEn: string;
  category: string;
  difficulty: Difficulty;
  createdAt: number;
  updatedAt: number;
  media: Media[];
}

export interface WorkoutSet {
  reps: number;
  weight?: number;
}

export interface WorkoutEntry {
  exerciseId: string;
  exerciseName: string;
  sets: WorkoutSet[];
}

export interface WorkoutSession {
  id: string;
  date: number;
  entries: WorkoutEntry[];
}

export const CATEGORIES = [
  'chest',
  'back',
  'legs',
  'shoulders',
  'arms',
  'core',
  'cardio',
  'other',
] as const;
