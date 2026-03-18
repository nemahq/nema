import { useRef } from "react";

import { useTranslation } from "@web/lib/tolgee";
import en from "@web/lib/tolgee/en.json";

const VARIANT_COUNT = Object.keys(en.session).filter((k) =>
  k.startsWith("empty_heading_"),
).length;

export function Greeting() {
  const { t } = useTranslation();
  /* eslint-disable-next-line react-hooks/purity -- one-time impure initializer, useRef is safe here */
  const variant = useRef(Math.floor(Math.random() * VARIANT_COUNT)).current;

  const headingKey =
    `session.empty_heading_${variant}` as "session.empty_heading_0";
  const subheadingKey =
    `session.empty_subheading_${variant}` as "session.empty_subheading_0";

  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <h2 className="text-2xl font-semibold text-fg-primary">
        {t(headingKey)}
      </h2>
      <p className="text-sm text-fg-tertiary">{t(subheadingKey)}</p>
    </div>
  );
}
