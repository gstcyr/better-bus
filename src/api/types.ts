// Response shapes for the STLGPS / MyBusStop ASMX service.
// Field names come straight from the reverse-engineered protocol (see PROTOCOL.md).

export interface Route {
  route_detail_id: number | string;
  routeName: string;
}

export interface DelaySummary {
  route_detail_id: number | string;
  dispatch_detail_id?: number;
  unit_number: string; // bus number
  gps_id?: number;
  gps_source?: number;
  cur_stop: number;
  total_stop: number;
  late_amount_est: string; // e.g. "10 min"
  late_amount: string; // e.g. "Driver error" or a time string
  unit_visible: string | boolean; // server sends the string "true"/"false"
  announcement: string; // "N/A" / "" == none
  current?: unknown;
}

export interface Stop {
  id: string; // stop sequence number (drives the numbered map icon)
  stop_id: string;
  stop_location: string; // name / address
  stop_location_type_description?: string; // e.g. "school"
  lat: number;
  long: number;
  is_mystop: boolean;
  stop_schedule_time?: string | null; // /Date(...)/
  stop_schedule_time_format?: string | null; // pretty display string
  stop_arrival_time?: string | null; // /Date(...)/  actual / estimated
}

export interface BusLocation {
  lat: number;
  long: number;
  stamp: string; // /Date(...)/  last-seen time
}

export interface AuthResult {
  authenticated: string; // "true" / "false"
}
