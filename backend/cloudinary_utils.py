"""
cloudinary_utils.py — Shared Cloudinary helpers

All cloudinary SDK imports are lazy (inside each function) so the module
loads safely even when the package is not installed locally.

Usage:
    CLOUDINARY_ENABLED = is_cloudinary_configured()
    setup_cloudinary()
    url = upload_image(image_bytes, public_id="picmatch/uuid")
    url = get_image_url("picmatch/uuid")  # Generate URL from public_id
    delete_image("picmatch/uuid")
"""
import os

CLOUDINARY_ENABLED = bool(os.getenv("CLOUDINARY_CLOUD_NAME"))
ALBUM_IMAGE_TRANSFORMS = (
    {"width": 2048, "crop": "limit", "quality": "auto"},
    {"width": 500, "crop": "limit", "quality": "auto"},
)


class DraftAssetConflict(ValueError):
    pass


def _draft_receipt(receipt, public_id, resource_type, context):
    if (receipt.get("public_id") != public_id or receipt.get("type") != "authenticated"
            or receipt.get("resource_type") != resource_type
            or receipt.get("context", {}).get("custom") != context or not receipt.get("asset_id")):
        raise DraftAssetConflict("Draft resource identity differs")
    return receipt


def upload_draft_media(file, public_id, resource_type, context):
    import cloudinary.uploader
    options = {"public_id": public_id, "resource_type": resource_type, "type": "authenticated",
               "overwrite": False, "context": context, "timeout": 120}
    if resource_type == "image":
        options["eager"] = list(ALBUM_IMAGE_TRANSFORMS)
    receipt = cloudinary.uploader.upload(str(file), **options)
    return _draft_receipt(receipt, public_id, resource_type, context)


def lookup_draft_media(public_id, resource_type, context):
    import cloudinary.api
    from cloudinary.exceptions import NotFound
    try:
        receipt = cloudinary.api.resource(public_id, resource_type=resource_type,
                                           type="authenticated", context=True, timeout=120)
    except NotFound:
        return None
    return _draft_receipt(receipt, public_id, resource_type, context)


def delete_draft_media(public_id, resource_type, context):
    import cloudinary.uploader
    if lookup_draft_media(public_id, resource_type, context) is None:
        return
    result = cloudinary.uploader.destroy(public_id, resource_type=resource_type,
                                         type="authenticated", invalidate=True, timeout=120)
    if result.get("result") not in {"ok", "not found"}:
        raise RuntimeError("Draft deletion not confirmed")


def upload_album_media(media_bytes: bytes, public_id: str, resource_type: str) -> str:
    import cloudinary.uploader
    options = {"public_id": public_id, "resource_type": resource_type,
               "type": "authenticated", "overwrite": False}
    if resource_type == "image":
        options["eager"] = list(ALBUM_IMAGE_TRANSFORMS)
    return cloudinary.uploader.upload(media_bytes, **options)["secure_url"]


def get_album_media_url(public_id: str, media_type: str, thumbnail: bool = False) -> str:
    """Server-only signed URL; the media gateway streams its bytes, never redirects."""
    import cloudinary.utils
    options = {"secure": True, "type": "authenticated", "sign_url": True,
               "resource_type": "video" if media_type == "video" else "image"}
    if media_type != "video":
        options.update(ALBUM_IMAGE_TRANSFORMS[1 if thumbnail else 0])
    return cloudinary.utils.cloudinary_url(public_id, **options)[0]


def is_cloudinary_configured() -> bool:
    return CLOUDINARY_ENABLED


def setup_cloudinary() -> None:
    """Configure Cloudinary SDK from environment variables."""
    if not CLOUDINARY_ENABLED:
        return
    import cloudinary
    cloudinary.config(
        cloud_name=os.getenv("CLOUDINARY_CLOUD_NAME"),
        api_key=os.getenv("CLOUDINARY_API_KEY"),
        api_secret=os.getenv("CLOUDINARY_API_SECRET"),
        secure=True,
    )


def upload_image(image_bytes: bytes, public_id: str) -> str:
    """
    Upload image or video bytes to Cloudinary.

    Args:
        image_bytes: Raw media data.
        public_id: Cloudinary public_id (e.g. "picmatch/uuid").

    Returns:
        The secure URL of the uploaded media.
    """
    import cloudinary.uploader
    response = cloudinary.uploader.upload(
        image_bytes,
        public_id=public_id,
        resource_type="auto",
        overwrite=True,
    )
    return response["secure_url"]


def get_image_url(public_id: str, resource_type: str = "image") -> str:
    """
    Generate a Cloudinary URL from a public_id.

    Applies the `f_auto,q_auto` transformation globally so every photo,
    avatar, and album cover is served in WebP/AVIF to capable browsers
    (~97% of users per caniuse.com) with the optimal perceptual quality
    dial. We deliberately do NOT hard-code quality=`auto:low` etc. —
    q_auto picks the lowest quality that still looks acceptable for
    each image individually.

    For videos, no image transformations are applied; the raw delivery URL is
    returned so the browser can play the original file.

    Expected payload reduction: ~60% vs. serving the original upload.
    Single edit-point so all consumers (album cards, gallery carousel,
    ImageLightbox, avatars) benefit simultaneously.
    """
    import cloudinary.utils
    if resource_type == "video":
        url, _ = cloudinary.utils.cloudinary_url(
            public_id,
            secure=True,
            resource_type="video",
        )
        return url
    url, _ = cloudinary.utils.cloudinary_url(
        public_id,
        secure=True,
        width=2048,
        crop="limit",
        fetch_format="auto",
        quality="auto",
    )
    return url


def get_thumb_url(public_id: str, resource_type: str = "image") -> str:
    """Generate a Cloudinary thumbnail URL with width=500 limit and auto optimization."""
    import cloudinary.utils
    if resource_type == "video":
        url, _ = cloudinary.utils.cloudinary_url(
            public_id,
            secure=True,
            resource_type="video",
        )
        return url
    url, _ = cloudinary.utils.cloudinary_url(
        public_id,
        secure=True,
        width=500,
        crop="limit",
        fetch_format="auto",
        quality="auto",
    )
    return url


def delete_image(public_id_or_url: str, resource_type: str = "image", delivery_type: str = "upload") -> None:
    """
    Delete an image or video from Cloudinary by its public_id or full URL.

    Args:
        public_id_or_url: Cloudinary public_id or full URL to delete.
        resource_type: Cloudinary resource type ("image" or "video").
    """
    pid = _resolve_public_id(public_id_or_url)
    try:
        import cloudinary.uploader
        cloudinary.uploader.destroy(pid, resource_type=resource_type, type=delivery_type, invalidate=True)
    except Exception:
        pass


def _resolve_public_id(value: str) -> str:
    """Extract public_id from a URL, or return as-is if it's already a public_id."""
    if "/upload/" not in value:
        return value
    try:
        after_upload = value.split("/upload/", 1)[1]
        segments = after_upload.split("/", 1)
        path = segments[1] if len(segments) == 2 and segments[0].startswith("v") else after_upload
        if "." in path:
            path = path.rsplit(".", 1)[0]
        return path
    except Exception:
        return value
