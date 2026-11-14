#include "WhisperBridge.h"
#include "whisper.h"
#include <atomic>
#include <cstdlib>
#include <cstring>
#include <mutex>
#include <string>
#include <algorithm>

struct SpeechContext { whisper_context * engine; std::atomic<bool> cancelled{false}; std::mutex inference; };
void * sc_whisper_create(const char * path) {
  auto options = whisper_context_default_params(); options.use_gpu = false;
  auto * engine = whisper_init_from_file_with_params(path, options);
  if (!engine) return nullptr;
  auto * state = new SpeechContext(); state->engine = engine; return state;
}
char * sc_whisper_transcribe(void * opaque, const float * samples, int count, const char * language, float * confidence) {
  auto * state = static_cast<SpeechContext *>(opaque); if (!state || count < 1600 || count > 16000 * 10) return nullptr;
  std::lock_guard<std::mutex> lock(state->inference); if (state->cancelled.load()) return nullptr;
  auto options = whisper_full_default_params(WHISPER_SAMPLING_GREEDY);
  options.n_threads = 2; options.translate = false; options.language = language;
  options.print_progress = false; options.print_realtime = false; options.print_timestamps = false; options.print_special = false;
  options.no_context = true; options.single_segment = false; options.suppress_blank = true;
  options.abort_callback = [](void * data) { return static_cast<SpeechContext *>(data)->cancelled.load(); };
  options.abort_callback_user_data = state;
  if (whisper_full(state->engine, options, samples, count) != 0 || state->cancelled.load()) return nullptr;
  std::string text; float sum = 0; int tokens = 0;
  for (int segment = 0; segment < whisper_full_n_segments(state->engine); ++segment) {
    text += whisper_full_get_segment_text(state->engine, segment);
    for (int token = 0; token < whisper_full_n_tokens(state->engine, segment); ++token) { sum += whisper_full_get_token_p(state->engine, segment, token); ++tokens; }
  }
  if (confidence) *confidence = tokens ? sum / tokens : 0;
  char * result = static_cast<char *>(malloc(text.size() + 1)); if (result) memcpy(result, text.c_str(), text.size() + 1); return result;
}
void sc_whisper_cancel(void * opaque) { if (opaque) static_cast<SpeechContext *>(opaque)->cancelled.store(true); }
void sc_whisper_destroy(void * opaque) { auto * state = static_cast<SpeechContext *>(opaque); if (!state) return; state->cancelled.store(true); { std::lock_guard<std::mutex> lock(state->inference); whisper_free(state->engine); } delete state; }
void sc_whisper_free_text(char * text) { free(text); }
