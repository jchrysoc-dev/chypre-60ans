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

export type Database = {
  public: {
    Tables: {
      households: Table<Household, 'label'>;
      people: Table<Person, 'household_id' | 'full_name'>;
      rsvps: Table<Rsvp, 'person_id' | 'attending'>;
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
}
