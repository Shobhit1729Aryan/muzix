"use client";
import { signIn, signOut, useSession } from "next-auth/react";
import type { ReactNode } from "react";

type AppbarProps = {
  mobileActions?: ReactNode;
  onSignOut?: () => void | Promise<void>;
  signOutCallbackUrl?: string;
  roomActionLabel?: string;
  mobileRoomActionLabel?: string;
  onRoomAction?: () => void | Promise<void>;
};

export function Appbar({
  mobileActions,
  onSignOut,
  signOutCallbackUrl = "/",
  roomActionLabel,
  mobileRoomActionLabel,
  onRoomAction,
}: AppbarProps) {
  const session = useSession();
  const mobileActionButtonClass =
    "flex h-8 min-w-[4rem] items-center justify-center whitespace-nowrap rounded px-3 text-xs font-semibold";

  async function handleSignOut() {
    await onSignOut?.();
    await signOut({ callbackUrl: signOutCallbackUrl });
  }

  return (
    <div>
      <div className="bg-gray-800 text-white">
        <div className="px-3 py-2 sm:p-4">
          <div className="flex items-center justify-between gap-1.5">
            <div className="shrink-0 text-sm font-semibold sm:text-base">Muzix</div>
            <div className="flex items-center gap-1 sm:hidden">
              {mobileActions}
              {session.data?.user && roomActionLabel && onRoomAction ? (
                <button
                  onClick={onRoomAction}
                  className={`${mobileActionButtonClass} border border-white/15 text-white hover:bg-white/5`}
                >
                  {mobileRoomActionLabel ?? roomActionLabel}
                </button>
              ) : null}
              {session.data?.user ? (
                <button
                  onClick={handleSignOut}
                  className={`${mobileActionButtonClass} bg-[#7DF9C2] text-[#08110d] transition hover:opacity-80`}
                >
                  Sign Out
                </button>
              ) : null}
            </div>
            <div className="hidden sm:block">
              {session.data?.user && (
                <div className="flex items-center gap-2">
                  {roomActionLabel && onRoomAction ? (
                    <button
                      onClick={onRoomAction}
                      className="rounded border border-white/15 px-4 py-2 font-bold text-white hover:bg-white/5"
                    >
                      {roomActionLabel}
                    </button>
                  ) : null}
                  <button
                    onClick={handleSignOut}
                    className="bg-[#7DF9C2] text-[#08110d] transition hover:opacity-80 font-bold py-2 px-4 rounded"
                  >
                    Sign Out
                  </button>
                </div>
              )}

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
