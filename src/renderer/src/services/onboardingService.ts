import { supabase } from '@renderer/lib/supabase';
import { PROFILE_ID } from '@renderer/types/profileId';

export interface LocalSetting {
  localProfileId: string | null;
  onboardingCompleted: number;
  lastImportAt: string | null;
  skipOnboarding: number;
}

export interface OnboardingState {
  shouldShowOnboarding: boolean;
  canImportHistory: boolean;
  reason: 'new_user' | 'incomplete_onboarding' | 'already_completed' | 'device_already_imported';
  message: string;
}

export const skipOnboarding = (): void => {
  try {
    window.electronAPI.local.skipOnboarding();
  } catch (error) {
    console.error('Failed to update local setting', error);
  }
};

export const checkAndSyncOnboarding = async (userId: string): Promise<OnboardingState> => {
  const localSettings: LocalSetting = (await window.electronAPI.local.getLocalSetting()) as any;
  const deviceHasImportedHistory = localSettings.onboardingCompleted === 1;
  const userSkippedOnboarding = localSettings.skipOnboarding === 1;

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error || !profile) {
    throw new Error('Failed to fetch user profile');
  }

  //
  // CASE A — DEVICE ALREADY IMPORTED HISTORY
  //
  if (deviceHasImportedHistory && !profile.has_completed_onboarding) {
    await supabase.from('profiles').update({ has_completed_onboarding: true }).eq('id', userId);

    window.electronAPI.local.updateLocalProfileId(userId);

    return {
      shouldShowOnboarding: false,
      canImportHistory: false,
      reason: 'device_already_imported',
      message: 'This device has already imported history earlier.'
    };
  }

  //
  // CASE B — USER SKIPPED ONBOARDING
  if (!deviceHasImportedHistory && userSkippedOnboarding) {
    return {
      shouldShowOnboarding: false,
      canImportHistory: true,
      reason: 'incomplete_onboarding',
      message: 'User skipped onboarding earlier.'
    };
  }

  //
  // CASE C — BRAND NEW USER
  //

  if (deviceHasImportedHistory && !userSkippedOnboarding) {
    return {
      shouldShowOnboarding: false,
      canImportHistory: false,
      reason: 'already_completed',
      message: 'User has completed the onboarding'
    };
  }

  //
  // CASE D — BRAND NEW USER
  //
  return {
    shouldShowOnboarding: true,
    canImportHistory: true,
    reason: 'new_user',
    message: 'Please complete onboarding to get started.'
  };
};

export const completeOnboarding = async (
  userId: string
): Promise<{ success: boolean; message: string }> => {
  const { data: canImport, error } = await supabase.rpc('lock_history_import');
  if (error) {
    return { success: false, message: `Failed to verify import ${error.message}` };
  }
  if (!canImport) {
    return { success: false, message: 'History already imported for this account' };
  }
  try {
    const setting: LocalSetting = {
      localProfileId: PROFILE_ID,
      onboardingCompleted: 1,
      lastImportAt: new Date().toISOString(),
      skipOnboarding: 0
    };
    window.electronAPI.local.updateLocalSetting(setting);
    await supabase.from('profiles').update({ has_completed_onboarding: true }).eq('id', userId);
    return { success: true, message: 'History imported successfully' };
  } catch (error) {
    console.error('Import failed', error);
    return { success: false, message: (error as Error).message };
  }
};

export const shouldShowImportButton = async (): Promise<boolean> => {
  const localSetting: LocalSetting = (await window.electronAPI.local.getLocalSetting()) as any;
  if (localSetting!.onboardingCompleted) {
    return false;
  } else {
    return true;
  }
};

export const resetLocalSetting = async (userId: string): Promise<void> => {
  window.electronAPI.local.resetLocalSetting();
  await supabase
    .from('profiles')
    .update({
      has_completed_onboarding: false,
      history_imported_at: null
    })
    .eq('id', userId);
};
