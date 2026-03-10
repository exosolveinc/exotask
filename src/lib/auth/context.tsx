"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";
import type { Employee } from "@/lib/supabase/types";

interface AuthContextValue {
  user: User | null;
  employee: Employee | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  employee: null,
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {

    // Get initial session
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user ?? null);
      if (user) {
        fetchEmployee(user.id, user.email ?? undefined);
      } else {
        setLoading(false);
      }
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      if (currentUser) {
        fetchEmployee(currentUser.id, currentUser.email ?? undefined);
      } else {
        setEmployee(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function fetchEmployee(authId: string, email?: string) {
    // Try by auth_id first
    const { data } = await supabase
      .from("employees")
      .select("*")
      .eq("auth_id", authId)
      .maybeSingle();

    if (data) {
      setEmployee(data);
      setLoading(false);
      return;
    }

    // Fallback: match by email (regardless of current auth_id) and link
    if (email) {
      const { data: byEmail } = await supabase
        .from("employees")
        .select("*")
        .eq("email", email)
        .maybeSingle();

      if (byEmail) {
        // Link auth_id to this employee
        await supabase
          .from("employees")
          .update({ auth_id: authId })
          .eq("id", byEmail.id);

        setEmployee({ ...byEmail, auth_id: authId });
        setLoading(false);
        return;
      }
    }

    setEmployee(null);
    setLoading(false);
  }

  async function signOut() {
    await supabase.auth.signOut();
    setUser(null);
    setEmployee(null);
    window.location.href = "/login";
  }

  return (
    <AuthContext.Provider value={{ user, employee, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
