/**
 * Intl pieces Hermes (RN 0.81) does not ship but the i18n runtime needs.
 *
 * Every import here is the CONDITIONAL polyfill: it installs itself only when
 * the engine lacks the feature (or answers it wrongly), so on Node/Jest — which
 * has full ICU — nothing changes. All pure JS, so it ships OTA.
 *
 *   - Intl.getCanonicalLocales / Intl.Locale: required by the PluralRules polyfill.
 *   - Intl.PluralRules: ICU plurals ({count, plural, one {…} other {…}}).
 *
 * Plural data is loaded for every language the app knows (lib/languageNames),
 * so a new UI catalog needs no change here. Each locale-data file is a guarded
 * no-op when the native PluralRules is in use.
 */
import "@formatjs/intl-getcanonicallocales/polyfill";
import "@formatjs/intl-locale/polyfill";
import "@formatjs/intl-pluralrules/polyfill";

import "@formatjs/intl-pluralrules/locale-data/ar";
import "@formatjs/intl-pluralrules/locale-data/bn";
import "@formatjs/intl-pluralrules/locale-data/cs";
import "@formatjs/intl-pluralrules/locale-data/da";
import "@formatjs/intl-pluralrules/locale-data/de";
import "@formatjs/intl-pluralrules/locale-data/el";
import "@formatjs/intl-pluralrules/locale-data/en";
import "@formatjs/intl-pluralrules/locale-data/es";
import "@formatjs/intl-pluralrules/locale-data/fa";
import "@formatjs/intl-pluralrules/locale-data/fi";
import "@formatjs/intl-pluralrules/locale-data/fr";
import "@formatjs/intl-pluralrules/locale-data/he";
import "@formatjs/intl-pluralrules/locale-data/hi";
import "@formatjs/intl-pluralrules/locale-data/hu";
import "@formatjs/intl-pluralrules/locale-data/id";
import "@formatjs/intl-pluralrules/locale-data/it";
import "@formatjs/intl-pluralrules/locale-data/ja";
import "@formatjs/intl-pluralrules/locale-data/ko";
import "@formatjs/intl-pluralrules/locale-data/ms";
import "@formatjs/intl-pluralrules/locale-data/nb";
import "@formatjs/intl-pluralrules/locale-data/nl";
import "@formatjs/intl-pluralrules/locale-data/no";
import "@formatjs/intl-pluralrules/locale-data/pl";
import "@formatjs/intl-pluralrules/locale-data/pt";
import "@formatjs/intl-pluralrules/locale-data/ro";
import "@formatjs/intl-pluralrules/locale-data/ru";
import "@formatjs/intl-pluralrules/locale-data/sv";
import "@formatjs/intl-pluralrules/locale-data/sw";
import "@formatjs/intl-pluralrules/locale-data/th";
import "@formatjs/intl-pluralrules/locale-data/tl";
import "@formatjs/intl-pluralrules/locale-data/tr";
import "@formatjs/intl-pluralrules/locale-data/uk";
import "@formatjs/intl-pluralrules/locale-data/ur";
import "@formatjs/intl-pluralrules/locale-data/vi";
import "@formatjs/intl-pluralrules/locale-data/zh";
