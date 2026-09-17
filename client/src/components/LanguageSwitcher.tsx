import { useTranslation } from "react-i18next";

export default function LanguageSwitcher() {
  const { i18n, t } = useTranslation();
  const language = i18n.resolvedLanguage === "fr" ? "fr" : "en";

  return (
    <label className="language-switcher">
      <span className="sr-only">{t("language.label")}</span>
      <select value={language} onChange={(event) => i18n.changeLanguage(event.target.value)} aria-label={t("language.label")}>
        <option value="en">{t("language.english")}</option>
        <option value="fr">{t("language.french")}</option>
      </select>
    </label>
  );
}
