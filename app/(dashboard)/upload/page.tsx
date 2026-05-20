import { UploadForm } from "@/components/upload/upload-form";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";

export default function UploadPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Upload document"
        description="Add PDF or Word files to your library. Word files are converted to PDF for signing."
      />
      <SectionCard>
        <UploadForm />
      </SectionCard>
    </div>
  );
}
