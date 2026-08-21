import { useAssetUrl } from "../lib/useAssetUrl";

export default function Thumb({
  id,
  className = "",
  alt = "",
}: {
  id: string;
  className?: string;
  alt?: string;
}) {
  const url = useAssetUrl("thumb256", id);
  if (!url) return <div className={`${className} bg-slate-100`} />;
  return <img src={url} className={className} alt={alt} draggable={false} />;
}
