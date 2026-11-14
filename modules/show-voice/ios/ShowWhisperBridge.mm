#import "ShowWhisperBridge.h"
#include "../shared/WhisperBridge.cpp"
@implementation SCWhisperBridge { void * _context; }
- (instancetype)initWithModelPath:(NSString *)path error:(NSError **)error {
  self = [super init]; if (self) { _context = sc_whisper_create(path.UTF8String); if (!_context) { if (error) *error = [NSError errorWithDomain:@"ShowVoice" code:1 userInfo:@{NSLocalizedDescriptionKey:@"Offline speech model could not be loaded"}]; return nil; } } return self;
}
- (NSDictionary<NSString *, id> *)transcribeSamples:(NSData *)samples language:(NSString *)language {
  float confidence = 0;
  char * text = sc_whisper_transcribe(_context, (const float *)samples.bytes, (int)(samples.length / sizeof(float)), language.UTF8String, &confidence);
  NSString * value = text ? [NSString stringWithUTF8String:text] : @""; sc_whisper_free_text(text);
  return @{@"text":value ?: @"", @"confidence":@(confidence)};
}
- (void)cancel { sc_whisper_cancel(_context); }
- (void)dealloc { sc_whisper_destroy(_context); }
@end
