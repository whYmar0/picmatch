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
    Upload image bytes to Cloudinary.

    Args:
        image_bytes: Raw image data (already compressed/resized).
        public_id: Cloudinary public_id (e.g. "picmatch/uuid").

    Returns:
        The secure URL of the uploaded image.
    """
    import cloudinary.uploader
    response = cloudinary.uploader.upload(
        image_bytes,
        public_id=public_id,
        resource_type="image",
        overwrite=True,
    )
    return response["secure_url"]


def get_image_url(public_id: str) -> str:
    """
    Generate a Cloudinary URL from a public_id.

    Args:
        public_id: Cloudinary public_id (e.g. "picmatch/uuid").

    Returns:
        Full HTTPS URL to the image.
    """
    import cloudinary.utils
    url, _ = cloudinary.utils.cloudinary_url(public_id, secure=True)
    return url


def delete_image(public_id_or_url: str) -> None:
    """
    Delete an image from Cloudinary by its public_id or full URL.

    Args:
        public_id_or_url: Cloudinary public_id or full URL to delete.
    """
    pid = _resolve_public_id(public_id_or_url)
    try:
        import cloudinary.uploader
        cloudinary.uploader.destroy(pid, resource_type="image")
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
