import { checkAndSyncOnboarding, OnboardingState } from '@renderer/services/onboardingService';
import { useAuth } from '@renderer/context/AuthContext';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

export const useOnboarding = (): { state: OnboardingState | null; loading: boolean } => {
  const [state, setState] = useState<OnboardingState | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const navigator = useNavigate();
  const { session } = useAuth();
  useEffect(() => {
    const init = async (): Promise<void> => {
      if (session) {
        const result = await checkAndSyncOnboarding(session!.user.id);
        setState(result);
        if (result.shouldShowOnboarding) {
          navigator('/onboarding');
        } else {
          navigator('/');
        }
      }
    };
    try {
      setLoading(true);
      init();
      setLoading(false);
    } catch (error) {
      console.error('Failed to check onboarding', error);
    }
  }, []);
  return { state, loading };
};
