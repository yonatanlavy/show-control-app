import type { AppLocale } from '../domain'

const copy = [
  ['history.version', 'Saved version', 'גרסה שמורה', 'Versión guardada', 'Version enregistrée', 'Gespeicherte Version', 'Versione salvata', 'Versão guardada', 'Сохранённая версия', '保存済みの版', 'نسخة محفوظة'],
  ['history.current', 'Current version', 'הגרסה הנוכחית', 'Versión actual', 'Version actuelle', 'Aktuelle Version', 'Versione attuale', 'Versão atual', 'Текущая версия', '現在の版', 'النسخة الحالية'],
  ['history.older', 'Older versions', 'גרסאות קודמות', 'Versiones anteriores', 'Versions plus anciennes', 'Ältere Versionen', 'Versioni precedenti', 'Versões anteriores', 'Более ранние версии', '古い版', 'نسخ أقدم'],
  ['history.newer', 'Newer versions', 'גרסאות חדשות יותר', 'Versiones más recientes', 'Versions plus récentes', 'Neuere Versionen', 'Versioni più recenti', 'Versões mais recentes', 'Более новые версии', '新しい版', 'نسخ أحدث'],
  ['history.page', 'Page {page}', 'עמוד {page}', 'Página {page}', 'Page {page}', 'Seite {page}', 'Pagina {page}', 'Página {page}', 'Страница {page}', '{page} ページ', 'الصفحة {page}'],
  ['history.empty', 'Saved changes will appear here.', 'שינויים שנשמרו יופיעו כאן.', 'Los cambios guardados aparecerán aquí.', 'Les modifications enregistrées apparaîtront ici.', 'Gespeicherte Änderungen erscheinen hier.', 'Le modifiche salvate appariranno qui.', 'As alterações guardadas aparecem aqui.', 'Здесь появятся сохранённые изменения.', '保存した変更がここに表示されます。', 'ستظهر التغييرات المحفوظة هنا.'],
  ['history.restoreHelp', 'Restore this version of the show? Your current version stays in history. Audio will not start.', 'לשחזר גרסה זו של המופע? הגרסה הנוכחית תישאר בהיסטוריה. לא תתחיל נגינה.', '¿Restaurar esta versión del espectáculo? La versión actual queda en el historial. El audio no se iniciará.', 'Restaurer cette version du spectacle ? La version actuelle reste dans l’historique. Aucun audio ne démarrera.', 'Diese Show-Version wiederherstellen? Die aktuelle Version bleibt im Verlauf. Audio wird nicht gestartet.', 'Ripristinare questa versione dello spettacolo? La versione attuale resta nella cronologia. L’audio non partirà.', 'Restaurar esta versão do espetáculo? A versão atual fica no histórico. O áudio não será iniciado.', 'Восстановить эту версию шоу? Текущая версия останется в истории. Звук не запустится.', 'この版のショーを復元しますか？現在の版は履歴に残ります。音声は再生されません。', 'هل تريد استعادة هذه النسخة من العرض؟ ستبقى النسخة الحالية في السجل. لن يبدأ الصوت.'],
  ['history.restoreDated', 'Restore version from {date}', 'שחזור גרסה מתאריך {date}', 'Restaurar versión del {date}', 'Restaurer la version du {date}', 'Version vom {date} wiederherstellen', 'Ripristina versione del {date}', 'Restaurar versão de {date}', 'Восстановить версию от {date}', '{date} の版を復元', 'استعادة النسخة بتاريخ {date}'],
] as const
type Key = typeof copy[number][0]
type Catalogue = Record<Key, string>
const locales: readonly AppLocale[] = ['en', 'he', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ja', 'ar']
export const historyEnglish = Object.fromEntries(copy.map((row) => [row[0], row[1]])) as Catalogue
export const historyTranslations = Object.fromEntries(locales.slice(1).map((locale, index) => [locale, Object.fromEntries(copy.map((row) => [row[0], row[index + 2]]))])) as Record<Exclude<AppLocale, 'en'>, Catalogue>
