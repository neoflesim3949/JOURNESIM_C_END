"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import "./ecard.css";

const LOGO_URL =
  "https://ecayqnbzzkbbrsjwdobe.supabase.co/storage/v1/object/public/media/___1_1775042420938.png";

// Small inline icon for divider / footer
const FlesimIconSmall = ({ size = 20 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 100 100"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <polygon points="15,80 15,55 35,55 35,65 25,65 25,80" fill="#3B76C8" />
    <polygon points="15,55 15,20 55,20 55,35 30,35 30,55" fill="#3B76C8" />
    <polygon points="55,20 85,20 85,50 70,50 70,35 55,35" fill="#3B76C8" />
    <polygon points="70,50 85,50 85,80 55,80 55,65 70,65" fill="#3B76C8" />
  </svg>
);

interface ContactInfo {
  name: string;
  nameEn: string;
  title: string;
  titleEn: string;
  company: string;
  tagline: string;
  email: string;
  phone: string;
  website: string;
  line: string;
  linkedin: string;
  instagram: string;
  avatarInitials: string;
}

const cardData: ContactInfo = {
  name: "高文杰",
  nameEn: "WEN-JIE GAO",
  title: "共同創辦人暨技術長",
  titleEn: "CO-FOUNDER & CTO",
  company: "飛訊移動",
  tagline: "FLY, FLEXIBLE, FLESIM",
  email: "wenjie@flesim.com",
  phone: "+886 900-000-000",
  website: "https://flesim.com",
  line: "flesim_official",
  linkedin: "https://linkedin.com/in/wenjiegao",
  instagram: "https://instagram.com/flesim",
  avatarInitials: "高",
};

export default function EcardClient() {
  const [copied, setCopied] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setTimeout(() => setLoaded(true), 80);
  }, []);

  const handleCopyEmail = async () => {
    try {
      await navigator.clipboard.writeText(cardData.email);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* noop */
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${cardData.name} — FLESIM`,
          text: `${cardData.name} ${cardData.title} | ${cardData.company}`,
          url: window.location.href,
        });
      } catch {
        /* user cancelled */
      }
    } else {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleAddContact = () => {
    const vcard = [
      "BEGIN:VCARD",
      "VERSION:3.0",
      `FN:${cardData.nameEn}`,
      `N:Gao;Wen-Jie;;;`,
      `ORG:FLESIM;${cardData.company}`,
      `TITLE:${cardData.titleEn}`,
      `EMAIL;TYPE=WORK:${cardData.email}`,
      `TEL;TYPE=WORK,VOICE:${cardData.phone}`,
      `URL:${cardData.website}`,
      "END:VCARD",
    ].join("\n");

    const blob = new Blob([vcard], { type: "text/vcard" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${cardData.nameEn.replace(" ", "_")}_FLESIM.vcf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={`ecard-root ${loaded ? "ecard-loaded" : ""}`}>
      {/* Subtle background decoration */}
      <div className="ecard-bg" aria-hidden="true">
        <div className="ecard-bg-blob ecard-bg-blob-1" />
        <div className="ecard-bg-blob ecard-bg-blob-2" />
        <div className="ecard-bg-dot-grid" />
      </div>

      <main className="ecard-container">
        {/* ── Header ── */}
        <header
          className="ecard-header ecard-animate-up"
          style={{ animationDelay: "0ms" }}
        >
          <Image
            src={LOGO_URL}
            alt="FLESIM Logo"
            width={160}
            height={52}
            className="ecard-logo-img"
            priority
          />
        </header>

        {/* ── Main card ── */}
        <section
          className="ecard-card ecard-animate-up"
          style={{ animationDelay: "80ms" }}
        >
          {/* Top accent bar */}
          <div className="ecard-card-accent" />

          {/* Profile */}
          <div className="ecard-profile">
            {/* Avatar */}
            <div className="ecard-avatar-wrap">
              <div className="ecard-avatar-ring" />
              <div className="ecard-avatar">
                <span className="ecard-avatar-initials">
                  {cardData.avatarInitials}
                </span>
              </div>
            </div>

            {/* Name */}
            <div className="ecard-name-block">
              <h1 className="ecard-name-zh">{cardData.name}</h1>
              <p className="ecard-name-en">{cardData.nameEn}</p>
            </div>

            {/* Title badges */}
            <div className="ecard-badge-wrap">
              <span className="ecard-badge">{cardData.title}</span>
              <span className="ecard-badge ecard-badge-outline">
                {cardData.titleEn}
              </span>
            </div>

            {/* Tagline */}
            <p className="ecard-tagline">{cardData.tagline}</p>

            {/* Company */}
            <p className="ecard-company">
              {cardData.company}&nbsp;|&nbsp;FLESIM.COM
            </p>
          </div>

          {/* Divider */}
          <div className="ecard-divider">
            <span className="ecard-divider-line" />
            <FlesimIconSmall size={18} />
            <span className="ecard-divider-line" />
          </div>

          {/* Contact items */}
          <div className="ecard-contact-list">
            <a
              href={`mailto:${cardData.email}`}
              className="ecard-contact-item"
            >
              <div className="ecard-contact-icon">
                <svg
                  width="17"
                  height="17"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                  <polyline points="22,6 12,13 2,6" />
                </svg>
              </div>
              <div className="ecard-contact-text">
                <span className="ecard-contact-label">Email</span>
                <span className="ecard-contact-value">{cardData.email}</span>
              </div>
              <span className="ecard-contact-arrow">›</span>
            </a>

            <a href={`tel:${cardData.phone}`} className="ecard-contact-item">
              <div className="ecard-contact-icon">
                <svg
                  width="17"
                  height="17"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 10.8 19.79 19.79 0 01.22 2.18 2 2 0 012.18 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 7.91a16 16 0 006.1 6.1l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
                </svg>
              </div>
              <div className="ecard-contact-text">
                <span className="ecard-contact-label">電話 / Phone</span>
                <span className="ecard-contact-value">{cardData.phone}</span>
              </div>
              <span className="ecard-contact-arrow">›</span>
            </a>

            <a
              href={cardData.website}
              target="_blank"
              rel="noopener noreferrer"
              className="ecard-contact-item"
            >
              <div className="ecard-contact-icon">
                <svg
                  width="17"
                  height="17"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="2" y1="12" x2="22" y2="12" />
                  <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
                </svg>
              </div>
              <div className="ecard-contact-text">
                <span className="ecard-contact-label">官方網站</span>
                <span className="ecard-contact-value">flesim.com</span>
              </div>
              <span className="ecard-contact-arrow">›</span>
            </a>
          </div>
        </section>

        {/* ── Social links ── */}
        <section
          className="ecard-social ecard-animate-up"
          style={{ animationDelay: "160ms" }}
        >
          <a
            href={`https://line.me/ti/p/~${cardData.line}`}
            target="_blank"
            rel="noopener noreferrer"
            className="ecard-social-btn"
            id="btn-line"
          >
            <span className="ecard-social-icon">
              <svg
                width="22"
                height="22"
                viewBox="0 0 32 32"
                fill="currentColor"
              >
                <path d="M16 3C9.37 3 4 7.7 4 13.5c0 3.76 2.5 7.06 6.27 8.93-.28.97-.9 3.62-.98 3.98-.1.45.17.44.36.32.14-.1 2.27-1.54 3.19-2.16.69.1 1.42.15 2.16.15 6.63 0 12-4.7 12-10.5S22.63 3 16 3zm-4.1 13.38H9.67a.5.5 0 01-.5-.5v-5.25a.5.5 0 011 0v4.75h1.73a.5.5 0 010 1zm2.1 0a.5.5 0 01-1 0v-5.25a.5.5 0 011 0v5.25zm5.7 0a.5.5 0 01-.46-.3l-2.54-3.5v3.3a.5.5 0 01-1 0v-5.25a.5.5 0 01.96-.2l2.54 3.5v-3.3a.5.5 0 011 0v5.25a.5.5 0 01-.5.5zm3.7 0H21.2a.5.5 0 010-1h.75v-1.38H21.2a.5.5 0 010-1h.75V13h-.75a.5.5 0 010-1h1.25c.28 0 .5.22.5.5v3.38h.25a.5.5 0 010 1h-.25v.5a.5.5 0 01-.5.5z" />
              </svg>
            </span>
            <span>LINE</span>
          </a>

          <a
            href={cardData.instagram}
            target="_blank"
            rel="noopener noreferrer"
            className="ecard-social-btn"
            id="btn-instagram"
          >
            <span className="ecard-social-icon">
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                <path d="M16 11.37A4 4 0 1112.63 8 4 4 0 0116 11.37z" />
                <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
              </svg>
            </span>
            <span>Instagram</span>
          </a>

          <a
            href={cardData.linkedin}
            target="_blank"
            rel="noopener noreferrer"
            className="ecard-social-btn"
            id="btn-linkedin"
          >
            <span className="ecard-social-icon">
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-2-2 2 2 0 00-2 2v7h-4v-7a6 6 0 016-6zM2 9h4v12H2z" />
                <circle cx="4" cy="4" r="2" />
              </svg>
            </span>
            <span>LinkedIn</span>
          </a>
        </section>

        {/* ── Action buttons ── */}
        <section
          className="ecard-actions ecard-animate-up"
          style={{ animationDelay: "240ms" }}
        >
          <button
            className="ecard-action-btn ecard-action-primary"
            onClick={handleAddContact}
            id="btn-add-contact"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <line x1="19" y1="8" x2="19" y2="14" />
              <line x1="22" y1="11" x2="16" y2="11" />
            </svg>
            加入通訊錄
          </button>

          <div className="ecard-action-row">
            <button
              className="ecard-action-btn ecard-action-secondary"
              onClick={handleCopyEmail}
              id="btn-copy-email"
            >
              {copied ? (
                <>
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  已複製！
                </>
              ) : (
                <>
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                  </svg>
                  複製 Email
                </>
              )}
            </button>

            <button
              className="ecard-action-btn ecard-action-share"
              onClick={handleShare}
              id="btn-share"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
              </svg>
              分享名片
            </button>
          </div>
        </section>

        {/* ── Promo ── */}
        <section
          className="ecard-promo ecard-animate-up"
          style={{ animationDelay: "320ms" }}
        >
          <a
            href="https://flesim.com/shop"
            target="_blank"
            rel="noopener noreferrer"
            className="ecard-promo-card"
            id="btn-shop"
          >
            <div className="ecard-promo-icon">✈️</div>
            <div className="ecard-promo-text">
              <strong>出國上網，選 FLESIM eSIM</strong>
              <span>全球 190+ 國家，即買即用，免換卡</span>
            </div>
            <div className="ecard-promo-arrow">›</div>
          </a>
        </section>

        {/* ── Footer ── */}
        <footer
          className="ecard-footer ecard-animate-up"
          style={{ animationDelay: "400ms" }}
        >
          <div className="ecard-footer-logo">
            <FlesimIconSmall size={14} />
            <span>飛訊移動 FLESIM</span>
          </div>
          <p className="ecard-footer-copy">© 2024 FLESIM. All rights reserved.</p>
        </footer>
      </main>
    </div>
  );
}
