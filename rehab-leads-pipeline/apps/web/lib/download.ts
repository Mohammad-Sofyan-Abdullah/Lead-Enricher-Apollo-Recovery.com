import { toast } from "sonner";

export async function downloadFile(url: string, filename: string): Promise<void> {
  const toastId = toast.loading("Preparing download…");
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Server returned ${res.status}`);

    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(objectUrl);

    toast.success(`Downloaded ${filename}`, { id: toastId });
  } catch (err) {
    toast.error(
      `Download failed: ${err instanceof Error ? err.message : String(err)}`,
      { id: toastId }
    );
  }
}
