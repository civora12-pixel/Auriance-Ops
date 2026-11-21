import { useState } from "react";
import { Shirt } from "lucide-react";
import { cn } from "@/lib/utils.ts";

/** A product photo that fills its box, with a soft placeholder when there's none. */
export function ProductImage({
  url,
  alt,
  className,
}: {
  url: string | null | undefined;
  alt: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <div className={cn("relative overflow-hidden bg-shop-soft", className)}>
      {url && !failed ? (
        <img
          src={url}
          alt={alt}
          loading="lazy"
          decoding="async"
          className="absolute inset-0 size-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-shop-icon">
          <Shirt className="size-1/3" aria-hidden />
        </div>
      )}
    </div>
  );
}
