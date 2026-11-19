import QRCode from 'qrcode';
import { useEffect, useState } from 'react';

/** A QR code as inline SVG, so it prints sharp at any size. */
export function QrCode({ text, label }: { text: string; label: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    QRCode.toString(text, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#101410', light: '#ffffff' } })
      .then((markup) => live && setSvg(markup))
      .catch(() => live && setSvg(null));
    return () => {
      live = false;
    };
  }, [text]);
  // The markup comes from the qrcode library, built from our own URL, not from user input.
  return <div className="qr" role="img" aria-label={label} data-qr={text} dangerouslySetInnerHTML={svg ? { __html: svg } : undefined} />;
}
