#include <jni.h>
#include "WhisperBridge.h"
#include <cstdint>
#include <cstdio>
extern "C" JNIEXPORT jlong JNICALL Java_app_showcontrol_voice_WhisperNative_create(JNIEnv * env, jobject, jstring path) {
  const char * file = env->GetStringUTFChars(path, nullptr); void * state = sc_whisper_create(file); env->ReleaseStringUTFChars(path, file); return reinterpret_cast<jlong>(state);
}
extern "C" JNIEXPORT jobjectArray JNICALL Java_app_showcontrol_voice_WhisperNative_transcribe(JNIEnv * env, jobject, jlong state, jfloatArray samples, jstring language) {
  const char * lang = env->GetStringUTFChars(language, nullptr); float * pcm = env->GetFloatArrayElements(samples, nullptr); float confidence = 0;
  char * text = sc_whisper_transcribe(reinterpret_cast<void *>(state), pcm, env->GetArrayLength(samples), lang, &confidence);
  env->ReleaseFloatArrayElements(samples, pcm, JNI_ABORT); env->ReleaseStringUTFChars(language, lang);
  jobjectArray result = env->NewObjectArray(2, env->FindClass("java/lang/String"), nullptr);
  env->SetObjectArrayElement(result, 0, env->NewStringUTF(text ? text : ""));
  char score[32]; snprintf(score, sizeof(score), "%f", confidence); env->SetObjectArrayElement(result, 1, env->NewStringUTF(score));
  sc_whisper_free_text(text); return result;
}
extern "C" JNIEXPORT void JNICALL Java_app_showcontrol_voice_WhisperNative_cancel(JNIEnv *, jobject, jlong state) { sc_whisper_cancel(reinterpret_cast<void *>(state)); }
extern "C" JNIEXPORT void JNICALL Java_app_showcontrol_voice_WhisperNative_destroy(JNIEnv *, jobject, jlong state) { sc_whisper_destroy(reinterpret_cast<void *>(state)); }
