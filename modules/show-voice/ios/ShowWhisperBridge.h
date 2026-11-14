#import <Foundation/Foundation.h>
NS_ASSUME_NONNULL_BEGIN
@interface SCWhisperBridge : NSObject
- (nullable instancetype)initWithModelPath:(NSString *)path error:(NSError **)error;
- (NSDictionary<NSString *, id> *)transcribeSamples:(NSData *)samples language:(NSString *)language;
- (void)cancel;
@end
NS_ASSUME_NONNULL_END
