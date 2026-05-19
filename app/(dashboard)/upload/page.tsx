import { GlassCard } from "@/components/glass/glass-card";
import { UploadForm } from "@/components/upload/upload-form";

export default function UploadPage() {
  return (
    <GlassCard className="w-full">
      <h2 className="mb-2 text-lg font-semibold">Upload document</h2>
      <p className="mb-4 max-w-2xl text-sm opacity-80">
        Upload PDF or Word (.docx, .doc). Word files are converted to PDF for signing. This form sends the external auth
        headers your API requires.
      </p>
      <UploadForm />
    </GlassCard>
  );
}
