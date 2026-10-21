// The account button in the top bar (nothing in the browser-only demo), and the same choices
// for the phone's app menu.
import { useEffect, useRef, useState } from "react";
import { LogOut, UserRound, Users } from "lucide-react";
import { SERVER, useAuth } from "./api";

export function AccountMenu() {
  const user = useAuth(s => s.session?.user);
  const { open, signOut } = useAuth();
  const [menu, setMenu] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setMenu(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setMenu(false); };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("pointerdown", close); window.removeEventListener("keydown", esc); };
  }, [menu]);
  if (!SERVER || !user) return null;
  const item = "w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800 text-left";
  return (
    <div className="relative" ref={ref}>
      <button className="flex items-center gap-1.5 p-2 rounded-lg text-zinc-300 hover:text-white hover:bg-zinc-800 text-sm" aria-label="Account" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(m => !m)} data-testid="account-menu">
        <UserRound size={18} /><span className="hidden xl:inline max-w-[120px] truncate">{user.displayName}</span>
      </button>
      {menu && (
        <div className="absolute right-0 top-full mt-1 w-56 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl py-1 z-50" role="menu">
          <div className="px-3 py-1.5 text-[12px] text-zinc-500 truncate">{user.username}</div>
          <button className={item} role="menuitem" onClick={() => { setMenu(false); open("account"); }}><UserRound size={15} /> Account</button>
          {user.isAdmin && <button className={item} role="menuitem" onClick={() => { setMenu(false); open("people"); }}><Users size={15} /> People</button>}
          <div className="border-t border-zinc-800 my-1" />
          <button className={item} role="menuitem" onClick={() => { setMenu(false); void signOut(); }}><LogOut size={15} /> Sign out</button>
        </div>
      )}
    </div>
  );
}

/** The phone menu's rows for the account (none in the demo). */
export function accountActions() {
  const { session, open, signOut } = useAuth.getState();
  const user = session?.user;
  if (!SERVER || !user) return [];
  return [
    { label: "Account", icon: <UserRound size={19} />, run: () => open("account") },
    ...(user.isAdmin ? [{ label: "People", icon: <Users size={19} />, run: () => open("people") }] : []),
    { label: "Sign out", icon: <LogOut size={19} />, run: () => void signOut() }
  ];
}
