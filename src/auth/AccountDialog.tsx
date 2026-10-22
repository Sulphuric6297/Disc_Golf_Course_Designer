// Your account: name, password, backup codes, and where you're signed in.
import { useEffect, useState } from "react";
import { Section } from "../components/ui";
import { api, useAuth } from "./api";
import { BackupCodes, Dialog, Form, Input, when } from "./parts";

interface SessionRow { id: string; current: boolean; createdAt: string; lastSeenAt: string; ip: string | null; userAgent: string | null }

/** "Chrome on Windows" from a user agent, near enough. */
const device = (ua: string | null) => {
  if (!ua) return "Unknown";
  const b = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${b} on ${os}` : b;
};

export function AccountDialog({ onClose }: { onClose: () => void }) {
  const { session, load, signOut } = useAuth();
  const user = session!.user!;
  const [name, setName] = useState(user.displayName);
  const [list, setList] = useState<{ sessions: SessionRow[]; backupCodesLeft: number } | null>(null);
  const [pw, setPw] = useState({ current: "", next: "", again: "", code: "" });
  const [pwDone, setPwDone] = useState(false);
  const [codesCode, setCodesCode] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);

  const refresh = () => api<{ sessions: SessionRow[]; backupCodesLeft: number }>("GET", "me/sessions").then(setList);
  useEffect(() => { void refresh(); }, []);

  return (
    <Dialog title="Account" onClose={onClose} testid="account-dialog">
      <div className="-mx-4">
        <Section title="Name">
          <Form submit="Save" onSubmit={async () => { await api("POST", "me", { displayName: name }); await load(); }}>
            <Input label={`Shown to others · signed in as ${user.username}`} value={name} onChange={setName} auto="name" />
          </Form>
        </Section>

        <Section title="Password">
          {pwDone ? <p className="text-sm text-emerald-300">Password changed. Signed out everywhere else.</p> : (
            <Form submit="Change password" testid="change-password" onSubmit={async () => {
              if (pw.next !== pw.again) throw new Error("The new passwords don't match");
              await api("POST", "me/password", { current: pw.current, next: pw.next, code: pw.code });
              setPwDone(true);
              void refresh();
            }}>
              <Input label="Current password" value={pw.current} onChange={v => setPw({ ...pw, current: v })} type="password" auto="current-password" />
              <Input label="New password" value={pw.next} onChange={v => setPw({ ...pw, next: v })} type="password" auto="new-password" />
              <Input label="New password again" value={pw.again} onChange={v => setPw({ ...pw, again: v })} type="password" auto="new-password" />
              <Input label="Code from your app" value={pw.code} onChange={v => setPw({ ...pw, code: v })} auto="one-time-code" mono />
            </Form>
          )}
        </Section>

        <Section title="Backup codes">
          {codes ? <BackupCodes codes={codes} /> : (
            <Form submit="New backup codes" onSubmit={async () => { setCodes((await api<{ backupCodes: string[] }>("POST", "me/backup-codes", { code: codesCode })).backupCodes); void refresh(); }}>
              <p className="text-sm text-zinc-300">{list ? `${list.backupCodesLeft} left` : "…"}</p>
              <Input label="Code from your app" value={codesCode} onChange={setCodesCode} auto="one-time-code" mono />
            </Form>
          )}
        </Section>

        <Section title="Signed in">
          <ul className="space-y-1.5" data-testid="my-sessions">
            {list?.sessions.map(s => (
              <li key={s.id} className="flex items-center gap-2 text-sm">
                <div className="flex-1 min-w-0">
                  <div className="text-zinc-100">{device(s.userAgent)}{s.current && <span className="ml-2 text-[11px] text-emerald-300">This device</span>}</div>
                  <div className="text-[12px] text-zinc-500">{s.ip ?? ""} · {when(s.lastSeenAt)}</div>
                </div>
                {!s.current && <button className="text-xs text-red-300 hover:text-red-200" onClick={() => void api("DELETE", `me/sessions/${s.id}`).then(refresh)}>Sign out</button>}
              </li>
            ))}
          </ul>
          <button className="mt-4 text-sm text-red-300 hover:text-red-200" onClick={() => void signOut()} data-testid="sign-out">Sign out</button>
        </Section>
      </div>
    </Dialog>
  );
}
