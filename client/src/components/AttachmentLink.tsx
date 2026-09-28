import { describeApiError } from "@/lib/errors";
import { trpc } from "@/lib/trpc";
import type { Locale } from "@shared/domain";
import { useState } from "react";

// Downloads an attachment through the API, which checks the viewer may see it.
export function AttachmentLink({
  attachmentId,
  locale,
  onError,
}: {
  attachmentId: number;
  locale: Locale;
  onError: (message: string) => void;
}) {
  const utils = trpc.useUtils();
  const [loading, setLoading] = useState(false);
  return (
    <button
      className="text-xs font-semibold text-[#a1722d] disabled:opacity-50"
      disabled={loading}
      onClick={async event => {
        event.preventDefault();
        setLoading(true);
        try {
          const file = await utils.requests.attachments.download.fetch({
            attachmentId,
            locale,
          });
          const bytes = Uint8Array.from(atob(file.dataBase64), c =>
            c.charCodeAt(0)
          );
          const url = URL.createObjectURL(
            new Blob([bytes], { type: file.mimeType })
          );
          const link = document.createElement("a");
          link.href = url;
          link.download = file.fileName;
          link.click();
          setTimeout(() => URL.revokeObjectURL(url), 60_000);
        } catch (error) {
          onError(describeApiError(error as { message: string }, locale));
        } finally {
          setLoading(false);
        }
      }}
    >
      {locale === "ar" ? "تنزيل" : "Download"}
    </button>
  );
}
