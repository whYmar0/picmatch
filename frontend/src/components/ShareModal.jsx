import AlbumLinkSheet from "./AlbumLinkSheet";

export default function ShareModal({ album, open, onClose }) {
  return <AlbumLinkSheet albumId={album?.id} open={open} onClose={onClose} />;
}
