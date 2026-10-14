import type { Metadata } from "next";
import EcardClient from "./EcardClient";

export const metadata: Metadata = {
  title: "FLESIM 電子名片",
  description: "FLESIM 飛訊移動 — 共同創辦人暨技術長 高文杰 的電子名片",
  openGraph: {
    type: "profile",
    title: "高文杰 — FLESIM 共同創辦人暨技術長",
    description: "FLY, FLEXIBLE, FLESIM | 飛訊移動 FLESIM.COM",
    siteName: "FLESIM",
  },
};

export default function EcardPage() {
  return <EcardClient />;
}
