import { useCallback, useEffect, useRef, useState } from "react";
import api, { authStorage } from "../api";
import { useAuth } from "../contexts/AuthContext";
import { createMediaAccess } from "../utils/mediaAccess";

const access = createMediaAccess({ apiBase: api.defaults.baseURL, origin: window.location.origin,
  getToken: authStorage.getToken,
  request: (url, token) => api.get(url, { headers: { Authorization: `Bearer ${token}` } }) });

export const resolveMediaSource = (src, options) => access.resolve(src, options);

export function useMediaSource(src) {
  const { user } = useAuth();
  const token = authStorage.getToken() || "";
  const key = `${user?.id || ""}\n${token}\n${src || ""}`;
  const [source, setSource] = useState({ key: null, url: undefined, failed: false });
  const sequence = useRef(0);
  const attempts = useRef(0);

  const load = useCallback((force = false) => {
    const attempt = ++sequence.current;
    setSource({ key, url: undefined, failed: false });
    if (!src) return;
    access.resolve(src, { force }).then(url => {
      if (sequence.current === attempt && token === (authStorage.getToken() || "")) setSource({ key, url, failed: false });
    }).catch(() => {
      if (sequence.current === attempt && token === (authStorage.getToken() || "")) {
        // The native error event preserves existing image fallback/error handlers.
        setSource({ key, url: src, failed: true });
      }
    });
  }, [key, src, token]);

  useEffect(() => {
    access.syncSession();
    attempts.current = 0;
    load();
    return () => { sequence.current += 1; };
  }, [load]);

  const retry = useCallback(() => {
    if (source.key !== key || source.failed || attempts.current >= 1) return false;
    attempts.current += 1;
    load(true);
    return true;
  }, [key, source.key, source.failed, load]);

  // Hide the former account's DOM source during render, before effect cleanup.
  return { url: source.key === key ? source.url : undefined, retry,
    loaded: () => { attempts.current = 0; }, identity: key };
}
