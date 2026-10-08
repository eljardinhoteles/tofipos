import { useEffect, useState } from 'react';
import { Paperclip } from '@phosphor-icons/react';
import { resolverComprobanteUrlAsync } from '@/lib/comprobantes';

/** Link al comprobante adjunto de un abono — resuelve la URL (R2 o blob local offline) al montar. */
export function PagoComprobanteLink({ url }: { url: string }) {
 const [href, setHref] = useState('');
 useEffect(() => {
 let alive = true;
 resolverComprobanteUrlAsync(url).then((resolved) => { if (alive) setHref(resolved); });
 return () => { alive = false; };
 }, [url]);

 if (!href) return null;
 return (
 <a
 href={href} target="_blank" rel="noreferrer"title="Ver comprobante"
 className="shrink-0 w-6 h-6 rounded-md bg-card border border-border flex items-center justify-center text-primary hover:bg-primary/10 transition-colors"
 >
 <Paperclip size={12} weight="bold" />
 </a>
 );
}

