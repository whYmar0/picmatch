import { useEffect, useRef, useState } from "react";
import { albumsApi } from "../api";
import { useLang } from "../contexts/LangContext";
import BottomSheet from "./BottomSheet";

function linkURL(state, analytics) {
  const url = state.invite_url || "";
  return analytics ? url.replace("/vote/", "/share/") : url;
}

export default function AlbumLinkSheet({ albumId, open, onClose, analytics = false, zIndex = 50 }) {
  const { t } = useLang();
  const [state, setState] = useState(null);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [confirmation, setConfirmation] = useState(null);
  const [reload, setReload] = useState(0);
  const epoch = useRef(0);
  const blocked = useRef(false);
  const button = "w-full py-3 px-4 rounded-2xl font-semibold bg-primary-500 text-white disabled:opacity-50";

  useEffect(() => {
    const attempt = ++epoch.current;
    blocked.current = false;
    setState(null); setUrl(""); setMessage(""); setConfirmation(null); setBusy(false);
    if (!open || !albumId) return;
    setBusy(true); blocked.current = true;
    albumsApi.getInvitation(albumId).then(reply => {
      if (epoch.current === attempt) {
        setState(reply);
        setUrl(linkURL(reply, analytics));
      }
    }).catch(() => { if (epoch.current === attempt) setMessage(t("shareLinkError")); })
      .finally(() => { if (epoch.current === attempt) { setBusy(false); blocked.current = false; } });
    return () => { epoch.current += 1; };
  }, [open, albumId, analytics, t, reload]);

  async function change(action) {
    if (blocked.current) return;
    blocked.current = true; setBusy(true); setMessage(""); setConfirmation(null);
    const attempt = epoch.current;
    try {
      const reply = await albumsApi[action](albumId);
      if (epoch.current !== attempt) return;
      setState(reply); setUrl(linkURL(reply, analytics));
    } catch {
      if (epoch.current !== attempt) return;
      setMessage(t("linkUnconfirmed"));
      setUrl(""); setState(null);
      try {
        const actual = await albumsApi.getInvitation(albumId);
        if (epoch.current === attempt) { setState(actual); setUrl(linkURL(actual, analytics)); }
      } catch { /* Keep unknown state until the user reopens the panel. */ }
    } finally {
      if (epoch.current === attempt) { setBusy(false); blocked.current = false; }
    }
  }

  async function share() {
    if (blocked.current || !state?.is_active) return;
    blocked.current = true; setBusy(true); setMessage("");
    const attempt = epoch.current;
    try {
      const target = url;
      if (epoch.current !== attempt) return;
      setUrl(target);
      if (navigator.share) {
        try { await navigator.share({ title: "Pickmatch", url: target }); }
        catch (error) { if (error.name !== "AbortError") throw error; }
      } else {
        await navigator.clipboard.writeText(target);
        if (epoch.current === attempt) setMessage(t("copied"));
      }
    } catch { if (epoch.current === attempt) setMessage(t("shareLinkError")); }
    finally { if (epoch.current === attempt) { setBusy(false); blocked.current = false; } }
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={t("shareAlbum")} zIndex={zIndex}>
      <div className="space-y-4">
        <p className="text-sm text-gray-500 dark:text-gray-400">{t("linkAccessHint")}</p>
        {busy && <p role="status">{t("loading")}</p>}
        {state && !state.is_active && <p>{t("linkRevoked")}</p>}
        {url && <p className="break-all text-sm select-all">{url}</p>}
        {message && <p role="status">{message}</p>}
        {!state && !busy && <button className={button} onClick={() => setReload(value => value + 1)}>{t("linkRetry")}</button>}
        {state?.is_active ? <>
          <button className={button} disabled={busy} onClick={share}>{t("shareAlbum")}</button>
          <button className={button} disabled={busy} onClick={() => setConfirmation("rotateInvitation")}>{t("regenerateLink")}</button>
          <button className={button + " bg-red-500"} disabled={busy} onClick={() => setConfirmation("revokeInvitation")}>{t("revokeLink")}</button>
        </> : state && <button className={button} disabled={busy} onClick={() => change("createInvitation")}>{t("createLink")}</button>}
        {confirmation && <div className="space-y-3 border-t pt-4">
          <p>{t("linkResetWarning")}</p>
          <button className={button} disabled={busy} onClick={() => change(confirmation)}>{t("linkConfirm")}</button>
          <button className={button} disabled={busy} onClick={() => setConfirmation(null)}>{t("linkCancel")}</button>
        </div>}
      </div>
    </BottomSheet>
  );
}
