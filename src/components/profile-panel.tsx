"use client";

import { useState } from "react";
import { X, Mail, Phone, Slack, Shield, Clock, Target, TrendingUp, Loader } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import type { Employee } from "@/lib/supabase/types";
import { getInitials } from "@/lib/utils";

interface ProfilePanelProps {
  open: boolean;
  onClose: () => void;
  employee: Employee;
  onUpdated: () => void;
}

export function ProfilePanel({ open, onClose, employee, onUpdated }: ProfilePanelProps) {
  const [editing, setEditing] = useState(false);
  const [nickname, setNickname] = useState(employee.nickname || "");
  const [phone, setPhone] = useState(employee.phone || "");
  const [saving, setSaving] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [passwordMsg, setPasswordMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  if (!open) return null;

  async function handleSaveProfile() {
    setSaving(true);
    await supabase
      .from("employees")
      .update({ nickname: nickname || null, phone: phone || null })
      .eq("id", employee.id);
    setSaving(false);
    setEditing(false);
    onUpdated();
  }

  async function handleChangePassword() {
    if (newPassword.length < 6) {
      setPasswordMsg({ type: "error", text: "Password must be at least 6 characters" });
      return;
    }
    setChangingPassword(true);
    setPasswordMsg(null);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      setPasswordMsg({ type: "error", text: error.message });
    } else {
      setPasswordMsg({ type: "success", text: "Password updated successfully" });
      setNewPassword("");
    }
    setChangingPassword(false);
  }

  const stats = [
    { icon: Target, label: "Tasks Completed", value: employee.tasks_completed },
    { icon: Clock, label: "On-Time Rate", value: `${employee.on_time_percentage}%` },
    { icon: TrendingUp, label: "Variance Ratio", value: `${employee.avg_variance_ratio}x` },
    { icon: Clock, label: "Avg Response", value: `${Math.round(employee.avg_response_minutes)}m` },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh]">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md max-h-[75vh] overflow-hidden bg-zinc-900 border border-zinc-700/50 rounded-xl shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800/50">
          <h3 className="text-sm font-medium text-zinc-100">Profile</h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Avatar + Name */}
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-zinc-700 flex items-center justify-center text-lg font-semibold text-zinc-200">
              {getInitials(employee.name)}
            </div>
            <div>
              <div className="text-base font-medium text-zinc-100">{employee.name}</div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 border border-zinc-700/50 text-zinc-400 capitalize">
                  {employee.role}
                </span>
                {employee.is_active && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                    Active
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Contact Info */}
          <div className="space-y-2">
            <div className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Contact</div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2.5 text-sm text-zinc-400">
                <Mail size={14} className="text-zinc-600" />
                {employee.email}
              </div>
              {employee.phone && (
                <div className="flex items-center gap-2.5 text-sm text-zinc-400">
                  <Phone size={14} className="text-zinc-600" />
                  {employee.phone}
                </div>
              )}
              {employee.slack_id && (
                <div className="flex items-center gap-2.5 text-sm text-zinc-400">
                  <Slack size={14} className="text-zinc-600" />
                  Connected
                </div>
              )}
            </div>
          </div>

          {/* Performance Stats */}
          <div className="space-y-2">
            <div className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Performance</div>
            <div className="grid grid-cols-2 gap-2">
              {stats.map((stat) => (
                <div key={stat.label} className="px-3 py-2.5 bg-zinc-800/50 rounded-lg border border-zinc-700/40">
                  <div className="flex items-center gap-1.5 mb-1">
                    <stat.icon size={12} className="text-zinc-500" />
                    <span className="text-[10px] text-zinc-500">{stat.label}</span>
                  </div>
                  <div className="text-sm font-medium text-zinc-200 tabular-nums">{stat.value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Edit Profile */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Edit Profile</div>
              {!editing && (
                <button
                  onClick={() => setEditing(true)}
                  className="text-xs text-purple-400 hover:text-purple-300"
                >
                  Edit
                </button>
              )}
            </div>
            {editing ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Nickname</label>
                  <input
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    placeholder="Display name"
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700/50 rounded-lg text-sm text-zinc-100 placeholder:text-zinc-600 outline-none focus:border-zinc-500 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Phone</label>
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+977..."
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700/50 rounded-lg text-sm text-zinc-100 placeholder:text-zinc-600 outline-none focus:border-zinc-500 transition-colors"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveProfile}
                    disabled={saving}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-purple-500/15 border border-purple-500/30 text-purple-300 hover:bg-purple-500/25 transition-colors disabled:opacity-50"
                  >
                    {saving && <Loader size={10} className="animate-spin" />}
                    Save
                  </button>
                  <button
                    onClick={() => setEditing(false)}
                    className="flex-1 px-3 py-1.5 text-xs rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-zinc-300 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-sm text-zinc-400">
                <span className="text-zinc-600">Nickname:</span> {employee.nickname || "Not set"}
              </div>
            )}
          </div>

          {/* Change Password */}
          <div className="space-y-2">
            <div className="text-xs font-medium text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
              <Shield size={12} />
              Security
            </div>
            <div className="flex gap-2">
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="New password"
                className="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-700/50 rounded-lg text-sm text-zinc-100 placeholder:text-zinc-600 outline-none focus:border-zinc-500 transition-colors"
              />
              <button
                onClick={handleChangePassword}
                disabled={changingPassword || !newPassword}
                className="px-3 py-2 text-xs rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-zinc-300 transition-colors disabled:opacity-50"
              >
                {changingPassword ? <Loader size={12} className="animate-spin" /> : "Update"}
              </button>
            </div>
            {passwordMsg && (
              <div className={`text-xs px-3 py-2 rounded-lg border ${
                passwordMsg.type === "success"
                  ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
                  : "text-red-400 bg-red-500/10 border-red-500/20"
              }`}>
                {passwordMsg.text}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
