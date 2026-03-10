import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder"
);

export async function POST(req: Request) {
  const { name, email, password, role, nickname } = await req.json();

  if (!name || !email || !password) {
    return NextResponse.json({ error: "name, email, and password are required" }, { status: 400 });
  }

  if (password.length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
  }

  // 1. Create Supabase auth user
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 400 });
  }

  const authId = authData.user.id;

  // 2. Create employee record linked to auth user
  const { data: employee, error: empError } = await supabase
    .from("employees")
    .insert({
      auth_id: authId,
      name,
      email,
      nickname: nickname || null,
      role: role || "developer",
    })
    .select()
    .single();

  if (empError) {
    // Rollback: delete the auth user if employee creation fails
    await supabase.auth.admin.deleteUser(authId);
    return NextResponse.json({ error: empError.message }, { status: 500 });
  }

  return NextResponse.json({ employee });
}
