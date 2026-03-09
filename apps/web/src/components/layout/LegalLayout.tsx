import "./legal.css";

import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";

import NemaLogo from "@web/assets/nema-logo.svg";

export function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <Link to="/" className="mb-8 inline-block">
        <img
          src={NemaLogo}
          alt="Nema"
          className="h-5 brightness-0 dark:invert"
        />
      </Link>
      <article className="prose-legal max-w-none">{children}</article>
    </div>
  );
}
