import type { AppLocale } from '../domain'

export const workflowEnglish = {
  'workflow.backPlaylist': 'Back to playlist',
  'workflow.details': 'Name & notes',
  'workflow.unsaved': 'Save your changes?',
  'workflow.unsavedHelp': 'The name or notes have changed. Save them or discard them before leaving.',
  'workflow.discard': 'Discard changes',
  'workflow.exactTiming': 'Exact timing · {name}',
  'workflow.musicHelp': 'Choose music for this moment. Preview it, then add it to your section.',
  'workflow.role': 'Music for this moment',
  'workflow.addedCount': '{count} added this visit',
  'workflow.addAnother': 'Add another',
  'workflow.sourceDetails': 'Source details',
  'workflow.moreHelp': 'Everything you need to prepare your next show.',
} as const
type Catalogue = Record<keyof typeof workflowEnglish, string>
export const translatedWorkflow: Record<Exclude<AppLocale, 'en'>, Catalogue> = {
  he: {
    'workflow.backPlaylist': 'חזרה לפלייליסט', 'workflow.details': 'שם והערות', 'workflow.unsaved': 'לשמור את השינויים?', 'workflow.unsavedHelp': 'השם או ההערות השתנו. יש לשמור או לבטל את השינויים לפני היציאה.', 'workflow.discard': 'ביטול השינויים', 'workflow.exactTiming': 'תזמון מדויק · {name}', 'workflow.musicHelp': 'בחרו מוזיקה לרגע הזה. האזינו לתצוגה מקדימה והוסיפו לקטע במופע.', 'workflow.role': 'מוזיקה לרגע הזה', 'workflow.addedCount': '{count} נוספו בביקור הזה', 'workflow.addAnother': 'הוספת עותק נוסף', 'workflow.sourceDetails': 'פרטי המקור', 'workflow.moreHelp': 'כל מה שצריך להכנת המופע הבא.',
  },
  es: {
    'workflow.backPlaylist': 'Volver a la lista', 'workflow.details': 'Nombre y notas', 'workflow.unsaved': '¿Guardar los cambios?', 'workflow.unsavedHelp': 'El nombre o las notas han cambiado. Guarda o descarta los cambios antes de salir.', 'workflow.discard': 'Descartar cambios', 'workflow.exactTiming': 'Tiempo exacto · {name}', 'workflow.musicHelp': 'Elige música para este momento. Escúchala y añádela a tu sección.', 'workflow.role': 'Música para este momento', 'workflow.addedCount': '{count} añadidas en esta visita', 'workflow.addAnother': 'Añadir otra copia', 'workflow.sourceDetails': 'Detalles de la fuente', 'workflow.moreHelp': 'Todo para preparar tu próximo espectáculo.',
  },
  fr: {
    'workflow.backPlaylist': 'Retour à la playlist', 'workflow.details': 'Nom et notes', 'workflow.unsaved': 'Enregistrer les modifications ?', 'workflow.unsavedHelp': 'Le nom ou les notes ont changé. Enregistrez ou abandonnez les modifications avant de quitter.', 'workflow.discard': 'Abandonner les modifications', 'workflow.exactTiming': 'Temps précis · {name}', 'workflow.musicHelp': 'Choisissez une musique pour ce moment. Écoutez-la, puis ajoutez-la à votre séquence.', 'workflow.role': 'Musique pour ce moment', 'workflow.addedCount': '{count} ajouts pendant cette visite', 'workflow.addAnother': 'Ajouter une autre copie', 'workflow.sourceDetails': 'Détails de la source', 'workflow.moreHelp': 'Tout pour préparer votre prochain spectacle.',
  },
  de: {
    'workflow.backPlaylist': 'Zurück zur Playlist', 'workflow.details': 'Name und Notizen', 'workflow.unsaved': 'Änderungen speichern?', 'workflow.unsavedHelp': 'Name oder Notizen wurden geändert. Vor dem Verlassen speichern oder verwerfen.', 'workflow.discard': 'Änderungen verwerfen', 'workflow.exactTiming': 'Exakte Zeit · {name}', 'workflow.musicHelp': 'Wähle Musik für diesen Moment. Höre sie an und füge sie deinem Abschnitt hinzu.', 'workflow.role': 'Musik für diesen Moment', 'workflow.addedCount': '{count} in diesem Besuch hinzugefügt', 'workflow.addAnother': 'Weitere Kopie hinzufügen', 'workflow.sourceDetails': 'Quelldetails', 'workflow.moreHelp': 'Alles zur Vorbereitung deiner nächsten Show.',
  },
  it: {
    'workflow.backPlaylist': 'Torna alla playlist', 'workflow.details': 'Nome e note', 'workflow.unsaved': 'Salvare le modifiche?', 'workflow.unsavedHelp': 'Il nome o le note sono cambiati. Salva o annulla le modifiche prima di uscire.', 'workflow.discard': 'Annulla le modifiche', 'workflow.exactTiming': 'Tempo preciso · {name}', 'workflow.musicHelp': 'Scegli la musica per questo momento. Ascoltala, poi aggiungila alla tua sezione.', 'workflow.role': 'Musica per questo momento', 'workflow.addedCount': '{count} aggiunte durante questa visita', 'workflow.addAnother': 'Aggiungi un’altra copia', 'workflow.sourceDetails': 'Dettagli della fonte', 'workflow.moreHelp': 'Tutto per preparare il tuo prossimo spettacolo.',
  },
  pt: {
    'workflow.backPlaylist': 'Voltar à playlist', 'workflow.details': 'Nome e notas', 'workflow.unsaved': 'Guardar as alterações?', 'workflow.unsavedHelp': 'O nome ou as notas mudaram. Guarde ou descarte as alterações antes de sair.', 'workflow.discard': 'Descartar alterações', 'workflow.exactTiming': 'Tempo exato · {name}', 'workflow.musicHelp': 'Escolha música para este momento. Ouça e adicione à sua secção.', 'workflow.role': 'Música para este momento', 'workflow.addedCount': '{count} adicionadas nesta visita', 'workflow.addAnother': 'Adicionar outra cópia', 'workflow.sourceDetails': 'Detalhes da fonte', 'workflow.moreHelp': 'Tudo para preparar o seu próximo espetáculo.',
  },
  ru: {
    'workflow.backPlaylist': 'Назад к плейлисту', 'workflow.details': 'Название и заметки', 'workflow.unsaved': 'Сохранить изменения?', 'workflow.unsavedHelp': 'Название или заметки изменены. Сохраните или отмените изменения перед выходом.', 'workflow.discard': 'Отменить изменения', 'workflow.exactTiming': 'Точное время · {name}', 'workflow.musicHelp': 'Выберите музыку для этого момента. Прослушайте и добавьте её в раздел.', 'workflow.role': 'Музыка для этого момента', 'workflow.addedCount': 'Добавлено за этот сеанс: {count}', 'workflow.addAnother': 'Добавить ещё одну копию', 'workflow.sourceDetails': 'Сведения об источнике', 'workflow.moreHelp': 'Всё для подготовки вашего следующего шоу.',
  },
  ja: {
    'workflow.backPlaylist': 'プレイリストに戻る', 'workflow.details': '名前とメモ', 'workflow.unsaved': '変更を保存しますか？', 'workflow.unsavedHelp': '名前またはメモが変更されています。保存するか破棄してから移動してください。', 'workflow.discard': '変更を破棄', 'workflow.exactTiming': '正確な時間 · {name}', 'workflow.musicHelp': 'この場面の音楽を選び、試聴してからセクションに追加します。', 'workflow.role': 'この場面の音楽', 'workflow.addedCount': '今回 {count} 曲を追加', 'workflow.addAnother': 'もう1つ追加', 'workflow.sourceDetails': '提供元の詳細', 'workflow.moreHelp': '次のショーの準備に必要なツール。',
  },
  ar: {
    'workflow.backPlaylist': 'العودة إلى قائمة التشغيل', 'workflow.details': 'الاسم والملاحظات', 'workflow.unsaved': 'حفظ التغييرات؟', 'workflow.unsavedHelp': 'تغير الاسم أو الملاحظات. احفظ التغييرات أو تجاهلها قبل المغادرة.', 'workflow.discard': 'تجاهل التغييرات', 'workflow.exactTiming': 'توقيت دقيق · {name}', 'workflow.musicHelp': 'اختر موسيقى لهذه اللحظة. استمع إليها ثم أضفها إلى فقرتك.', 'workflow.role': 'موسيقى لهذه اللحظة', 'workflow.addedCount': 'أُضيفت {count} خلال هذه الزيارة', 'workflow.addAnother': 'إضافة نسخة أخرى', 'workflow.sourceDetails': 'تفاصيل المصدر', 'workflow.moreHelp': 'كل ما تحتاجه للتحضير لعرضك القادم.',
  },
}
