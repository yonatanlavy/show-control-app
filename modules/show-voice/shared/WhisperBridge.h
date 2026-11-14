#pragma once
#include <stddef.h>
#ifdef __cplusplus
extern "C" {
#endif
void * sc_whisper_create(const char * path);
char * sc_whisper_transcribe(void * context, const float * samples, int count, const char * language, float * confidence);
void sc_whisper_cancel(void * context);
void sc_whisper_destroy(void * context);
void sc_whisper_free_text(char * text);
#ifdef __cplusplus
}
#endif
