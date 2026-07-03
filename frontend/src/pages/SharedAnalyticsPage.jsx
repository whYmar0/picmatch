/**
 * pages/SharedAnalyticsPage.jsx
 *
 * Visitor landing for /share/:token URLs. Calls the public analytics-by-
 * token endpoint, then hands the payload off to the same AlbumSummary
 * component the owner uses. The token-protected route is the only place
 * that ever uses this endpoint — keeps the album id out of the URL.
 *
 * Auth required (handled by ProtectedRoute + returnTo round-trip on
 * Login). On 404 / 403 we show the friendly NeedAccessEmptyState without
 * leaking whether the album exists.
 */
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";

import { albumsApi } from "../api";
import AlbumSummary from "../components/AlbumSummary";
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
        if (!cancelled) setAnalytics(data);
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

  return (
    <AlbumSummary
      analytics={analytics}
      onBack={() => navigate("/dashboard")}
    />
  );
}
