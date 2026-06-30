import { useState } from "react";
import { Modal, FormInput, Button } from "./ui";
import { useAuth, useMe } from "../context/AuthContext";
import { api, ApiError } from "../lib/api";

/**
 * Self-service "My account" modal, opened from the user menu. Lets the logged-in
 * user edit safe fields about themselves:
 *   - display name
 *   - preferred project-role labels (planning tags — NOT system permissions)
 *   - password (current → new)
 *
 * System roles, financial access, and BU are deliberately absent: those are
 * admin-only (Admin → Users), since self-setting them would be privilege
 * escalation.
 */
export function AccountModal({ onClose }: { onClose: () => void }) {
  const me = useMe();
  const { refresh } = useAuth();

  const [name, setName] = useState(me.name);
  const [rolesText, setRolesText] = useState(me.projectRoles.join(", "));
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileMsg, setProfileMsg] = useState<string | null>(null);
  const [profileErr, setProfileErr] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState<string | null>(null);
  const [pwErr, setPwErr] = useState<string | null>(null);

  const saveProfile = async () => {
    setProfileBusy(true);
    setProfileErr(null);
    setProfileMsg(null);
    try {
      const projectRoles = rolesText
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      await api.patch("/api/me", { name: name.trim(), projectRoles });
      await refresh();
      setProfileMsg("Profile updated.");
    } catch (e) {
      setProfileErr(e instanceof ApiError ? e.message : "Something went wrong");
    } finally {
      setProfileBusy(false);
    }
  };

  const changePassword = async () => {
    setPwBusy(true);
    setPwErr(null);
    setPwMsg(null);
    try {
      await api.post("/api/me/change-password", { currentPassword, newPassword });
      setPwMsg("Password updated.");
      setCurrentPassword("");
      setNewPassword("");
    } catch (e) {
      setPwErr(e instanceof ApiError ? e.message : "Something went wrong");
    } finally {
      setPwBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="My account" size="md">
      <div className="space-y-6">
        <section className="space-y-3">
          <FormInput label="Name" value={name} onChange={setName} />
          <FormInput
            label="Preferred project role(s)"
            value={rolesText}
            onChange={setRolesText}
            placeholder="e.g. iOS Dev, Backend"
            hint="Comma-separated planning labels — these don't change your permissions."
          />
          {profileErr && <p className="text-xs text-rose-600">{profileErr}</p>}
          {profileMsg && <p className="text-xs text-emerald-600">{profileMsg}</p>}
          <Button onClick={saveProfile} disabled={profileBusy || !name.trim()}>
            {profileBusy ? "Saving…" : "Save profile"}
          </Button>
        </section>

        <div className="border-t border-gray-100" />

        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-700">Change password</h3>
          <FormInput
            label="Current password"
            type="password"
            value={currentPassword}
            onChange={setCurrentPassword}
          />
          <FormInput
            label="New password"
            type="password"
            value={newPassword}
            onChange={setNewPassword}
            hint="At least 8 characters."
          />
          {pwErr && <p className="text-xs text-rose-600">{pwErr}</p>}
          {pwMsg && <p className="text-xs text-emerald-600">{pwMsg}</p>}
          <Button
            onClick={changePassword}
            disabled={pwBusy || !currentPassword || newPassword.length < 8}
          >
            {pwBusy ? "Updating…" : "Update password"}
          </Button>
        </section>
      </div>
    </Modal>
  );
}
