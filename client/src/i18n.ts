import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import fr from "./locales/fr.json";

const LANGUAGE_STORAGE_KEY = "nutrition-dss-language";

const savedLanguage = typeof window === "undefined" ? null : localStorage.getItem(LANGUAGE_STORAGE_KEY);

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, fr: { translation: fr } },
  lng: savedLanguage === "fr" ? "fr" : "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

i18n.on("languageChanged", (language) => {
  if (typeof window !== "undefined") localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
});

export default i18n;
