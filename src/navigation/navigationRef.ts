import { createNavigationContainerRef } from '@react-navigation/native';
import type { RootStackParamList } from './types';

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

/** Navigate from outside the React tree (e.g. a notification tap handler). */
export function navigate<Name extends keyof RootStackParamList>(
  name: Name,
  params?: RootStackParamList[Name],
): void {
  if (navigationRef.isReady()) {
    // @ts-expect-error params is correctly typed at call sites
    navigationRef.navigate(name, params);
  }
}
