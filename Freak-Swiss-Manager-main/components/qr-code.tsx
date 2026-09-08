"use client";

import { QRCodeSVG } from "qrcode.react";

export function QrCode({ value, label = "Tournament join QR code" }: { value: string; label?: string }) {
  if (!value) return null;
  return (
    <QRCodeSVG 
      value={value} 
      size={200}
      className="qr-code" 
      aria-label={label}
      style={{ width: "100%", height: "auto" }}
    />
  );
}
