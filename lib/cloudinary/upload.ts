import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

export type CloudinaryUploadResult = {
  secureUrl: string;
  publicId: string;
  format: string;
};

export async function uploadPdfToCloudinary(file: Buffer, fileName: string): Promise<CloudinaryUploadResult> {
  return uploadRawPdfToCloudinary(file, fileName, "quiksign/documents");
}

/** Store original Word bytes unchanged (authenticated raw). */
export async function uploadOfficeToCloudinary(
  file: Buffer,
  fileName: string,
): Promise<CloudinaryUploadResult> {
  const lower = fileName.toLowerCase();
  const mime = lower.endsWith(".doc")
    ? "application/msword"
    : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const base64 = `data:${mime};base64,${file.toString("base64")}`;
  const ext = lower.endsWith(".doc") ? "doc" : "docx";

  const result = await cloudinary.uploader.upload(base64, {
    resource_type: "raw",
    folder: "quiksign/documents/originals",
    public_id: fileName.replace(/\.(docx?|DOCX?)$/i, ""),
    type: "authenticated",
    overwrite: false,
    invalidate: true,
    use_filename: true,
    unique_filename: true,
    format: ext,
  });

  return {
    secureUrl: result.secure_url,
    publicId: result.public_id,
    format: result.format ?? ext,
  };
}

export async function uploadRawPdfToCloudinary(
  file: Buffer,
  fileName: string,
  folder: string,
): Promise<CloudinaryUploadResult> {
  const base64 = `data:application/pdf;base64,${file.toString("base64")}`;

  const result = await cloudinary.uploader.upload(base64, {
    resource_type: "raw",
    folder,
    public_id: fileName.replace(/\.pdf$/i, ""),
    type: "authenticated",
    overwrite: false,
    invalidate: true,
    use_filename: true,
    unique_filename: true,
    format: "pdf",
  });

  return {
    secureUrl: result.secure_url,
    publicId: result.public_id,
    format: result.format ?? "pdf",
  };
}

export function getSignedDocumentUrl(publicId: string, expiresInSeconds = 60 * 60): string {
  return cloudinary.utils.private_download_url(publicId, "pdf", {
    resource_type: "raw",
    type: "authenticated",
    expires_at: Math.floor(Date.now() / 1000) + expiresInSeconds,
    attachment: false,
  });
}

export async function fetchCloudinaryFileBuffer(publicId: string): Promise<Buffer> {
  const downloadUrl = getSignedDocumentUrl(publicId);
  const response = await fetch(downloadUrl);
  if (!response.ok) {
    throw new Error(`Failed to download Cloudinary file: ${response.status}`);
  }
  const bytes = await response.arrayBuffer();
  return Buffer.from(bytes);
}

export async function fetchCloudinaryBySignedUrl(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download Cloudinary resource: ${response.status}`);
  }
  const bytes = await response.arrayBuffer();
  return Buffer.from(bytes);
}
