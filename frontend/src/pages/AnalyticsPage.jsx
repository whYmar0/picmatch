/**
 * pages/AnalyticsPage.jsx — Страница аналитики альбома для создателей
 * Album analytics view for creators with winner highlight
 */

import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { albumsApi } from "../api";
import AlbumSummary from "../components/AlbumSummary";
import LoadingSpinner from "../components/LoadingSpinner";

export default function AnalyticsPage() {
  const { albumId } = useParams();
  const navigate = useNavigate();
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    albumsApi.getAnalytics(albumId)
      .then(setAnalytics)
      .catch((err) => {
        toast.error(err.message);
        navigate("/dashboard");
      })
      .finally(() => setLoading(false));
  }, [albumId]);

  if (loading) return <LoadingSpinner fullscreen />;

  return (
    <AlbumSummary
      analytics={analytics}
      onBack={() => navigate("/dashboard")}
    />
  );
}
