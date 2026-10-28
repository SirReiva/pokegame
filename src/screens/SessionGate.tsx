import type { ReactNode } from 'react';
import { useLocation } from 'wouter';
import { useSession } from '../session/useSession';
import { ErrorScreen, LoadingScreen } from '../ui/BootScreen';

interface SessionGateProps {
  label: string;
  detail?: string;
  children: ReactNode;
}

/** Espera al manifiesto y al índice de mapas antes de montar una pantalla. */
export function SessionGate({ label, detail, children }: SessionGateProps) {
  const [, navigate] = useLocation();
  const { bootStatus, bootError, retryBoot } = useSession();

  if (bootStatus === 'error') {
    return (
      <ErrorScreen
        message={bootError ?? 'No se pudo preparar la sesión'}
        onRetry={retryBoot}
        onBack={() => navigate('/')}
      />
    );
  }

  if (bootStatus === 'loading') {
    return <LoadingScreen label={label} detail={detail} />;
  }

  return <>{children}</>;
}
