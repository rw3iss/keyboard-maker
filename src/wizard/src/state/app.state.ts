import { signal, computed } from '@preact/signals';
import type { BuildConfig } from '../types/project.types';

export const currentProject = signal<string | null>(null);
export const projectConfig = signal<BuildConfig | null>(null);
export const activeTab = signal<'overview' | 'config' | 'build'>('overview');
export const isProjectDirty = signal(false);
export const isLoading = signal(false);

export const hasProject = computed(() => currentProject.value !== null);
