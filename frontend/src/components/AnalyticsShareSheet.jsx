import AlbumLinkSheet from "./AlbumLinkSheet";

export default function AnalyticsShareSheet({ open, onClose, albumId, zIndex = 50 }) {
  return <AlbumLinkSheet albumId={albumId} open={open} onClose={onClose} analytics zIndex={zIndex} />;
}
