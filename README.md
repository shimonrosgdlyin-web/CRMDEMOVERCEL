# production_folder — CRM deployment snapshot

זוהי תמונת-מצב "נקייה" של ה-CRM (`crm/`), המכילה רק את מה שדרוש כדי לבנות ולהריץ אותו בסביבת production — ללא כלי פיתוח, בדיקות, תיעוד סוכנים (`CLAUDE.md`) או קבצי build זמניים.

**חשוב: זו תיקייה נגזרת (derived).** אל תערוך קבצים כאן ישירות — ערוך ב-`crm/`, ואז הרץ מחדש את `sync-production-folder.ps1` שבשורש הריפו כדי לרענן את התיקייה הזו. עריכה ישירה כאן תיעלם בסנכרון הבא ותגרום לסטייה (drift) בין המקור לתיקיית ה-production.

## מה הוצא (ולמה)

לא הועתקו: `node_modules/`, `.next/`, `playwright-report/`, `test-results/`, `tsconfig.tsbuildinfo` (כולם generated/regeneratable), `playwright.config.ts`, `vitest.config.ts`, `tests/`, `src/test/`, כל קובץ `*.test.ts` (כולם dev/CI-only), כל קובצי `CLAUDE.md` (תיעוד לסוכני AI, לא runtime), וכמובן **לא** `crm/.env.local` (סודות אמיתיים — לעולם לא מועתקים).

## הרצה בסביבת production

```bash
npm ci
npm run build
npm start
```

## משתני סביבה נדרשים

ראו `.env.local.example` (תבנית בלבד, ללא ערכים אמיתיים). יש ליצור `.env.local` עם ערכי production אמיתיים — או להגדיר אותם דרך מנגנון ה-secrets של שרת האירוח — **ולעולם לא ל-commit ערכים אמיתיים ל-git**:

| משתנה | חובה? | הערה |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | חובה | ציבורי (נחשף לדפדפן) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | חובה | ציבורי — anon key בלבד, **לא** service-role key |
| `APP_URL` | חובה | Server-only, בכוונה לא `NEXT_PUBLIC_*` — למניעת בניית לינקים מ-Host header שניתן לזייף |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | אופציונלי | רק אם נעשה שימוש ב-`/api/email` |

## מסד הנתונים (Supabase)

`supabase/migrations/` מכיל 14 קובצי SQL. יש להריץ אותם ידנית מול פרויקט ה-Supabase של production (Dashboard → SQL Editor) — הם לא רצים אוטומטית כחלק מה-build של Next.js.

**סטטוס נכון למועד יצירת תיקייה זו:** רק migrations 001–009 ו-011 מאושרים כמוחלים על סביבת ה-production הקיימת. migrations **010, 012, 013, 014 עדיין לא הוחלו** — כלומר הפיצ'רים שתלויים בהם (הזמנות לצוות/invites, פאנל platform-admin, אכיפת השעיית ארגונים) לא יעבדו בפועל עד שיוחלו. יש לוודא את הסטטוס בפועל מול הפרויקט לפני deploy, לא להסתמך רק על הערה זו.
