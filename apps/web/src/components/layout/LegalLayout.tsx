import "./legal.css";

import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";

import type { Locale } from "@nema-io/shared";

import NemaLogo from "@web/assets/nema-logo.svg";

const LOCALE_LABELS: Record<Locale, string> = {
  ko: "한국어",
  en: "English",
};

interface LegalLayoutProps {
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
  children: ReactNode;
}

export function LegalLayout({
  locale,
  onLocaleChange,
  children,
}: LegalLayoutProps) {
  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <div className="mb-8 flex items-center justify-between">
        <Link to="/">
          <img
            src={NemaLogo}
            alt="Nema"
            className="h-5 brightness-0 dark:invert"
          />
        </Link>
        <select
          value={locale}
          onChange={(e) => onLocaleChange(e.target.value as Locale)}
          className="rounded border border-neutral-300 bg-transparent px-2 py-1 text-sm dark:border-neutral-700"
        >
          {Object.entries(LOCALE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <article className="prose-legal max-w-none">{children}</article>
    </div>
  );
}
