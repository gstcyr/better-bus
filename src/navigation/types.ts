import type { Route, Stop } from '../api/types';

export type RootStackParamList = {
  Login: undefined;
  Map: { routeId?: string } | undefined;
  RoutePicker: { routes: Route[]; currentRouteId?: string };
  Stops: { routeId: string; stops: Stop[] };
  StopDetail: { stop: Stop };
  NotificationSettings: undefined;
};
