/**
 * Profile is the application user record that will later map 1:1 to
 * Supabase Auth (`auth.users.id` = `profiles.id`). Authentication is not
 * implemented in this step.
 */
export type UserRole = "Admin" | "Manager" | "Sales_BD";

export interface Profile {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  jobTitle: string;
  active: boolean;
  createdAt: string;
}
