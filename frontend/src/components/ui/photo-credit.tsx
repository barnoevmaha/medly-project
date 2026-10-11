import { cn } from "@/lib/utils";

/** What the API sends alongside a provider-supplied photo. */
export interface PhotoAttribution {
  provider: string;
  provider_id: string;
  source_url: string;
  photographer: string;
  photographer_url: string;
  width: number;
  height: number;
  alt: string;
}

const PROVIDER_LABEL: Record<string, string> = { pexels: "Pexels" };
const PROVIDER_HOME: Record<string, string> = { pexels: "https://www.pexels.com" };

/**
 * Credit for a stock photograph.
 *
 * Pexels' API guidelines ask for a visible credit to the photographer and a
 * link back to Pexels wherever their photos appear. Both links are rendered,
 * and `rel="noopener"` is set because they leave the app.
 */
export function PhotoCredit({
  image,
  className,
}: {
  image?: PhotoAttribution | null;
  className?: string;
}) {
  if (!image?.provider) return null;
  const label = PROVIDER_LABEL[image.provider] ?? image.provider;
  const home = PROVIDER_HOME[image.provider] ?? "#";

  return (
    <p className={cn("text-xs text-muted-foreground", className)}>
      {image.photographer ? (
        <>
          Photo by{" "}
          <a
            href={image.photographer_url || image.source_url || home}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-foreground"
          >
            {image.photographer}
          </a>{" "}
          on{" "}
        </>
      ) : (
        <>Photo from </>
      )}
      <a
        href={image.source_url || home}
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-2 hover:text-foreground"
      >
        {label}
      </a>
    </p>
  );
}

/** Section-level credit, for a list where per-photo credits would be noise. */
export function ProviderCredit({ className }: { className?: string }) {
  return (
    <p className={cn("text-xs text-muted-foreground", className)}>
      Photos provided by{" "}
      <a
        href="https://www.pexels.com"
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-2 hover:text-foreground"
      >
        Pexels
      </a>
    </p>
  );
}
