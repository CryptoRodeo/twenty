import { Text, View } from 'react-native';
import { movementColor } from '@/components/MovementBadge';
import { ProgressBar } from '@/components/ProgressBar';
import type { MovementProgress } from '@/domain/progression';
import { theme } from '@/theme';

export interface LandmarkProgressProps {
  progress: MovementProgress;
}

/** "Best N / target" with a progress bar and a badge once the target is met. */
export function LandmarkProgress({ progress }: LandmarkProgressProps) {
  const color = movementColor(progress.movement);
  return (
    <View>
      <Text style={{ ...theme.font.body, color: theme.colors.textDim, marginBottom: theme.spacing(2) }}>
        {`Best ${progress.best} / ${progress.target}`}
      </Text>
      <ProgressBar value={progress.best} max={progress.target} color={color} testID={`landmark-${progress.movement}`} />
      {progress.met && (
        <Text style={{ ...theme.font.body, color: theme.colors.success, marginTop: theme.spacing(2) }}>
          Target reached
        </Text>
      )}
    </View>
  );
}
