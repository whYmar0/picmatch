/**
 * pages/SharedAnalyticsPage.jsx
 *
 * Visitor landing for /share/:token URLs. Calls the public analytics-by-
 * token endpoint, then opens the SAME album viewer the owner uses
 * (AlbumGallery) with the statistics bottom sheet available — never a
 * voting page. Recipients who haven't voted yet can simply browse the
 * public results; the token grants the full stats the owner sees.
 *
 * Auth required (handled by ProtectedRoute + returnTo round-trip on
 * Login). On 404 / 403 we show the friendly NeedAccessEmptyState without
 * leaking whether the album exists.
 */
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";

import { albumsApi, votesApi } from "../api";
import AlbumGallery from "../components/AlbumGallery";
import NeedAccessEmptyState from "../components/NeedAccessEmptyState";
import { AnalyticsSkeleton } from "../components/Skeleton";

export default function SharedAnalyticsPage() {
  const { token } = useParams();
  const navigate  = useNavigate();

  const [analytics, setAnalytics] = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [errored,   setErrored]   = useState(false);

  useEffect(() => {
    let cancelled = false;
    setAnalytics(null);
    setErrored(false);
    setLoading(true);

    albumsApi
      .getByShareToken(token)
      .then((data) => {
        if (cancelled) return;
        setAnalytics(data);

        // Record the visit (fire-and-forget) so the album shows up under
        // "Recently visited" with an accurate Vote / Re-vote state. The
        // album creator opening their own link is not recorded.
        const storedUserRaw = localStorage.getItem("pickmatch_user");
        if (!storedUserRaw) return;
        try {
          const storedUser = JSON.parse(storedUserRaw);
          if (!storedUser?.id || String(data.creator_id) === String(storedUser.id)) return;
          votesApi
            .getMyVotes(data.id)
            .then((myVotes) => {
              import("../hooks/useRecentAlbums.js").then(({ recordAlbumVisit }) => {
                recordAlbumVisit(storedUser.id, {
                  id: data.id,
                  title: data.title,
                  coverUrl: data.photos?.[0]?.url ?? null,
                  creator_id: data.creator_id,
                  creatorUsername: data.creator?.username ?? null,
                  invite_code: data.invite_code,
                  invite_url: data.invite_url,
                  is_public: data.is_public,
                  hasAccess: data.can_view_stats || data.is_public,
                  hasVoted: myVotes.length > 0,
                });
              });
            })
            .catch(() => { /* non-voter / no album access — visit stays unrecorded */ });
        } catch { /* malformed stored user — ignore */ }
      })
      .catch(() => {
        if (!cancelled) setErrored(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [token]);

  if (loading) return <AnalyticsSkeleton />;
  if (errored  || !analytics) return <NeedAccessEmptyState />;

  const album = {
    id: analytics.id,
    title: analytics.title,
    description: analytics.description,
    creator: analytics.creator,
    creator_id: analytics.creator_id,
    is_public: analytics.is_public,
    photos: analytics.photos || [],
  };

  return (
    <AlbumGallery
      album={album}
      initialAnalytics={analytics}
      initialTab="stats"
      manageHistory={false}
      onClose={() => navigate("/dashboard", { replace: true })}
    />
  );
}
