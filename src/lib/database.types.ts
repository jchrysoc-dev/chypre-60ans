/**
 * Database types, written by hand to match supabase/migrations.
 * Keep in sync with the migrations (or regenerate with `npx supabase gen types typescript`).
 */
export type Role = 'guest' | 'admin';
export type Attending = 'yes' | 'no' | 'maybe';

type Table<Row, Required extends keyof Row> = {
  Row: Row;
  Insert: Pick<Row, Required> & Partial<Omit<Row, Required>>;
  Update: Partial<Row>;
  Relationships: [];
};

export type Household = {
  id: string;
  label: string;
  created_at: string;
}

export type Person = {
  id: string;
  household_id: string;
  full_name: string;
  email: string | null;
  is_child: boolean;
  role: Role;
  auth_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export type Rsvp = {
  person_id: string;
  attending: Attending;
  arrival_date: string | null;
  departure_date: string | null;
  flight_in: string | null;
  flight_out: string | null;
  dietary: string | null;
  dietary_consent_at: string | null;
  updated_at: string;
}

export type SignupStatus = 'confirmed' | 'waitlisted';

/** Copy of content/activities/*.md, written only by the server (public.sync_activities). */
export type ActivityRow = {
  id: string;
  title: string;
  starts_at: string;
  capacity: number | null;
  kid_friendly: boolean;
  cancelled: boolean;
  in_content: boolean;
  content_built_at: string;
}

export type ActivitySignup = {
  id: number;
  activity_id: string;
  person_id: string;
  group_id: string;
  status: SignupStatus;
  created_at: string;
  created_by: string | null;
  promoted_at: string | null;
}

/** Details a guest may share in the directory. Readable only by the guest and the organisers. */
export type Profile = {
  person_id: string;
  phone: string | null;
  phone_whatsapp: boolean;
  city: string | null;
  staying_at: string | null;
  staying_other: string | null;
  choices_saved_at: string;
  updated_at: string;
}

export const SHARING_FIELDS = ['listed', 'email', 'phone', 'city', 'staying_at', 'dates', 'activities', 'children'] as const;
export type SharingField = (typeof SHARING_FIELDS)[number];

/** One row per field a guest shares. Deleted when they switch it off. */
export type SharingConsent = {
  person_id: string;
  field: SharingField;
  granted_at: string;
}

/** One entry of public.participants(). Every field is null unless its owner shares it. */
export type Participant = {
  household_id: string;
  name: string;
  is_child: boolean;
  email: string | null;
  phone: string | null;
  phone_whatsapp: boolean | null;
  city: string | null;
  staying_at: string | null;
  staying_other: string | null;
  arrival_date: string | null;
  departure_date: string | null;
  activity_ids: string[] | null;
}

/** One activity as sent to public.sync_activities. */
export type ActivitySyncItem = Pick<ActivityRow, 'id' | 'title' | 'starts_at' | 'capacity' | 'kid_friendly' | 'cancelled'>;

export type Database = {
  public: {
    Tables: {
      households: Table<Household, 'label'>;
      people: Table<Person, 'household_id' | 'full_name'>;
      rsvps: Table<Rsvp, 'person_id' | 'attending'>;
      activities: Table<ActivityRow, 'id' | 'title' | 'starts_at' | 'content_built_at'>;
      activity_signups: Table<ActivitySignup, 'activity_id' | 'person_id' | 'group_id' | 'status'>;
      profiles: Table<Profile, 'person_id'>;
      sharing_consents: Table<SharingConsent, 'person_id' | 'field'>;
    };
    Views: { [_ in never]: never };
    Functions: {
      ping: { Args: Record<string, never>; Returns: string };
      sign_up: {
        Args: { p_activity_id: string; p_person_ids: string[]; p_over_capacity?: boolean };
        Returns: SignupStatus | 'unchanged';
      };
      activity_overview: {
        Args: Record<string, never>;
        Returns: { activity_id: string; confirmed: number; waitlisted: number }[];
      };
      my_waitlist_positions: {
        Args: Record<string, never>;
        Returns: { activity_id: string; group_id: string; people_ahead: number }[];
      };
      save_my_sharing: {
        Args: {
          p_phone: string | null;
          p_phone_whatsapp: boolean;
          p_city: string | null;
          p_staying_at: string | null;
          p_staying_other: string | null;
          p_fields: SharingField[];
        };
        Returns: undefined;
      };
      participants: { Args: Record<string, never>; Returns: Participant[] };
      sync_activities: { Args: { p_activities: ActivitySyncItem[]; p_built_at: string }; Returns: undefined };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
}
