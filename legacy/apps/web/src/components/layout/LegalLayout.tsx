import "./legal.css";

import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";

import type { Locale } from "@nema-io/shared";
import { isLocale } from "@nema-io/shared";
import {
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@nema-io/weave";

import NemaLogo from "@web/assets/nema-logo.svg";
import { Select } from "@web/components/ui/Select";

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
        <Select
          value={locale}
          onValueChange={(value) => {
            if (isLocale(value)) {
              onLocaleChange(value);
            }
          }}
        >
          <SelectTrigger className="w-28 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            {Object.entries(LOCALE_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <article className="prose-legal max-w-none">{children}</article>
    </div>
  );
}
